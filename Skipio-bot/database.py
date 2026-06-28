import logging
import psycopg2
from psycopg2 import pool
from config import DB_URL

logger = logging.getLogger(__name__)

# --- DATABASE CONNECTION WRAPPERS ---

class UnifiedCursorWrapper:
    def __init__(self, cur):
        self.cur = cur
    def execute(self, sql, params=None):
        return self.cur.execute(sql, params)
    def __getattr__(self, name):
        return getattr(self.cur, name)
    def __iter__(self):
        return iter(self.cur)
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self.cur, "close"):
            self.cur.close()

class UnifiedDBWrapper:
    def __init__(self, conn, close_callback=None):
        self.conn = conn
        self.close_callback = close_callback
    def cursor(self):
        return UnifiedCursorWrapper(self.conn.cursor())
    def commit(self):
        self.conn.commit()
    def close(self):
        if self.close_callback:
            self.close_callback()
        else:
            self.conn.close()
    def __getattr__(self, name):
        return getattr(self.conn, name)
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

_pg_pool = None


def get_db_connection_pool():
    global _pg_pool
    if _pg_pool:
        return _pg_pool
    if DB_URL:
        db_url_str = str(DB_URL).strip().strip('"').strip("'")
        try:
            params = db_url_str
            if "sslmode" not in db_url_str:
                params += "?sslmode=require" if "?" not in db_url_str else "&sslmode=require"
            _pg_pool = pool.ThreadedConnectionPool(1, 10, params)
            logger.info("Database connection pool created")
            return _pg_pool
        except Exception as e:
            logger.error("Failed to create connection pool: %s", e)
    return None


def get_conn():
    pool_obj = get_db_connection_pool()
    if pool_obj:
        for attempt in range(3):
            try:
                conn = pool_obj.getconn()
                if conn.closed:
                    try:
                        pool_obj.putconn(conn, close=True)
                    except Exception:
                        pass
                    continue
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                except Exception:
                    try:
                        pool_obj.putconn(conn, close=True)
                    except Exception:
                        pass
                    continue

                # Capture conn in default arg to avoid closure bug
                def return_to_pool(c=conn):
                    try:
                        pool_obj.putconn(c)
                    except Exception:
                        try:
                            c.close()
                        except Exception:
                            pass

                return UnifiedDBWrapper(conn, close_callback=return_to_pool)
            except Exception as e:
                logger.warning("Error getting connection from pool (attempt %d): %s", attempt + 1, e)

    if DB_URL:
        try:
            conn = psycopg2.connect(DB_URL, sslmode='require', connect_timeout=10)
            return UnifiedDBWrapper(conn)
        except Exception as e:
            logger.error("Direct connection failed: %s", e)
    return None


def close_pool():
    global _pg_pool
    if _pg_pool:
        _pg_pool.closeall()
        _pg_pool = None
        logger.info("Database connection pool closed")


def get_default_season():
    try:
        with get_conn() as conn:
            if not conn:
                return None
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM seasons WHERE is_active = true ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                return row[0]
            cursor.execute("SELECT id FROM seasons ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            return row[0] if row else None
    except Exception as e:
        logger.warning("get_default_season failed: %s", e)
        return None


def get_seasons():
    try:
        with get_conn() as conn:
            if not conn:
                return []
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM seasons ORDER BY id DESC")
            return cursor.fetchall()
    except Exception as e:
        logger.warning("get_seasons failed: %s", e)
        return []
