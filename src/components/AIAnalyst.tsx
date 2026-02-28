"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, User, Sparkles, ChevronDown } from "lucide-react";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function AIAnalyst() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hello! I'm the FLV AI Analyst. Ask me anything about team standings, player stats, map records, or match results!" }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.slice(1) // skip the welcome msg
                })
            });

            const data = await res.json();
            if (data.reply) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting to my central brain. Please check if a snapshot has been generated." }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: Could not reach the analyst service." }]);
        } finally {
            setLoading(false);
        }
    };

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
                <div className="w-[380px] h-[550px] glass overflow-hidden rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 animate-in zoom-in-95 duration-200 origin-bottom-right">
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
                                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border ${msg.role === 'assistant' ? 'bg-val-blue/20 border-val-blue/30 text-val-blue' : 'bg-val-red/20 border-val-red/30 text-val-red'
                                        }`}>
                                        {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                                    </div>
                                    <div className={`p-3 rounded-2xl text-xs leading-relaxed font-medium ${msg.role === 'assistant'
                                            ? 'bg-white/5 text-foreground rounded-tl-none border border-white/5'
                                            : 'bg-val-red text-white rounded-tr-none shadow-lg'
                                        }`}>
                                        {msg.content}
                                    </div>
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
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="Ask about league stats..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-xs focus:border-val-blue outline-none transition-all placeholder:text-foreground/20"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="absolute right-2 p-2 text-val-blue hover:scale-110 active:scale-95 transition-all disabled:opacity-30"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <div className="text-[9px] text-center text-foreground/20 font-black uppercase tracking-widest mt-3">
                            Experimental Analyst • grounded in S23 Data
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
