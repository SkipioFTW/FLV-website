import psycopg2
from psycopg2 import pool
from config import DB_URL

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

# Global Connection Pool
pg_pool = None

def get_db_connection_pool():
    global pg_pool
    if pg_pool: return pg_pool
    if DB_URL:
        db_url_str = str(DB_URL).strip().strip('"').strip("'")
        try:
            params = db_url_str
            if "sslmode" not in db_url_str:
                params += "?sslmode=require" if "?" not in db_url_str else "&sslmode=require"
            pg_pool = pool.ThreadedConnectionPool(1, 10, params)
            print("InfoBot: Database connection pool created.")
            return pg_pool
        except Exception as e:
            print(f"InfoBot: Failed to create connection pool: {e}")
    return None

def get_conn():
    pool_obj = get_db_connection_pool()
    if pool_obj:
        for attempt in range(3):
            try:
                conn = pool_obj.getconn()
                if conn.closed:
                    try: pool_obj.putconn(conn, close=True)
                    except: pass
                    continue
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                except Exception:
                    try: pool_obj.putconn(conn, close=True)
                    except: pass
                    continue
                
                def return_to_pool():
                    try: pool_obj.putconn(conn)
                    except: 
                        try: conn.close()
                        except: pass
                
                return UnifiedDBWrapper(conn, close_callback=return_to_pool)
            except Exception as e:
                print(f"InfoBot: Error getting connection from pool: {e}")
    
    if DB_URL:
        try:
            conn = psycopg2.connect(DB_URL, sslmode='require', connect_timeout=10)
            return UnifiedDBWrapper(conn)
        except Exception as e:
            print(f"InfoBot: Direct connection failed: {e}")
    return None

def get_default_season():
    try:
        with get_conn() as conn:
            if not conn: return "S24"
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM seasons WHERE is_active = true ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            return row[0] if row else "S24"
    except:
        return "S24"

def get_seasons():
    try:
        with get_conn() as conn:
            if not conn: return [("S24", "Season 24"), ("S23", "Season 23")]
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM seasons ORDER BY id DESC")
            return cursor.fetchall()
    except:
        return [("S24", "Season 24"), ("S23", "Season 23")]
