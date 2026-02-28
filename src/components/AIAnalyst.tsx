"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Bot, User, Sparkles, ChevronDown, Timer } from "lucide-react";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const COOLDOWN_SECONDS = 10;

// Simple markdown-to-HTML renderer for bold, bullets, and newlines
function renderMarkdown(text: string) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*)/gm, '<span class="flex gap-1.5 mt-1"><span class="text-val-blue mt-0.5">▸</span><span>$1</span></span>')
        .replace(/\n/g, '<br/>');
}

export default function AIAnalyst() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hey! I'm the **FLV AI Analyst**. Ask me anything — standings, player stats, map records, or who's popping off this week." }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0); // seconds remaining
    const scrollRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Cooldown tick
    useEffect(() => {
        if (cooldown > 0) {
            timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
        }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [cooldown]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading || cooldown > 0) return;

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);
        setCooldown(COOLDOWN_SECONDS);

        try {
            const history = messages
                .slice(1) // skip welcome msg
                .slice(-6) // only last 3 turns
                .map(m => ({ role: m.role, content: m.content }));

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, history })
            });

            const data = await res.json();
            if (res.ok && data.reply) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            } else {
                const errorMsg = data.error || data.message || "Unknown error";
                setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Analyst Error: ${errorMsg}` }]);
            }
        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Connection Error: ${e.message || "Check your internet."}` }]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, cooldown, messages]);

    const canSend = input.trim().length > 0 && !loading && cooldown === 0;

    return (
        <div className="fixed bottom-6 right-6 z-[100] font-montserrat">
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-16 h-16 bg-val-red rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,70,85,0.4)] hover:scale-110 transition-all group overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                    <MessageSquare className="text-white w-7 h-7 relative z-10 group-hover:rotate-12 transition-transform" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-val-blue rounded-full border-2 border-background animate-pulse" />
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="w-[380px] h-[560px] glass overflow-hidden rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 animate-in zoom-in-95 duration-200 origin-bottom-right">
                    {/* Header */}
                    <div className="p-4 bg-val-red flex items-center justify-between relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/10">
                                <Sparkles className="text-white w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h3 className="font-display text-sm font-black text-white italic tracking-widest uppercase">AI ANALYST</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping" />
                                    <span className="text-[10px] text-white/60 font-black uppercase tracking-widest">SEASON 23 LIVE</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-white transition-colors relative z-10">
                            <ChevronDown className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20 backdrop-blur-sm scrollbar-thin scrollbar-thumb-white/10"
                    >
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border ${msg.role === 'assistant' ? 'bg-val-blue/20 border-val-blue/30 text-val-blue' : 'bg-val-red/20 border-val-red/30 text-val-red'}`}>
                                        {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                                    </div>
                                    <div
                                        className={`p-3 rounded-2xl text-xs leading-relaxed font-medium ${msg.role === 'assistant'
                                            ? 'bg-white/5 text-foreground rounded-tl-none border border-white/5'
                                            : 'bg-val-red text-white rounded-tr-none shadow-lg'}`}
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] flex gap-2">
                                    <div className="w-8 h-8 rounded-full bg-val-blue/20 border border-val-blue/30 text-val-blue flex items-center justify-center animate-pulse">
                                        <Bot size={16} />
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none flex gap-1 items-center border border-white/5">
                                        <span className="w-1.5 h-1.5 bg-val-blue rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <span className="w-1.5 h-1.5 bg-val-blue rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <span className="w-1.5 h-1.5 bg-val-blue rounded-full animate-bounce" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-background border-t border-white/5">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value.slice(0, 500))}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder={cooldown > 0 ? `Please wait ${cooldown}s...` : "Ask about league stats..."}
                                disabled={cooldown > 0 && !loading}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-xs focus:border-val-blue outline-none transition-all placeholder:text-foreground/30 disabled:opacity-50"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!canSend}
                                className="absolute right-2 p-2 hover:scale-110 active:scale-95 transition-all disabled:opacity-30"
                            >
                                {cooldown > 0 && !loading ? (
                                    <span className="text-foreground/40 text-xs font-black w-5 flex items-center justify-center">{cooldown}</span>
                                ) : (
                                    <Send size={18} className="text-val-blue" />
                                )}
                            </button>
                        </div>
                        <div className="text-[9px] text-center text-foreground/20 font-black uppercase tracking-widest mt-2">
                            {cooldown > 0 ? `⏳ Cooldown · ${cooldown}s` : 'AI Analyst · S23 Live Data'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
