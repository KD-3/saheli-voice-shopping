import React from 'react';
import { motion } from 'framer-motion';
import { 
  Phone, 
  ShoppingCart, 
  RotateCcw, 
  Clock, 
  ShieldCheck, 
  Smartphone,
  TrendingUp,
  Activity
} from 'lucide-react';

const FADE_UP = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

const STAGGER = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.15 } }
};

function App() {
  return (
    <div className="min-h-screen font-sans selection:bg-accent/30 selection:text-accent">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-card border-b border-white/5 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-bold text-background text-sm">
            S
          </div>
          <span className="font-display font-semibold text-white tracking-tight">Saheli</span>
        </div>
        <a 
          href="https://github.com/KD-3/saheli-voice-shopping" 
          target="_blank" 
          rel="noreferrer"
          className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
        >
          GitHub
        </a>
      </nav>

      <main className="pt-32 pb-24 px-6 max-w-6xl mx-auto flex flex-col gap-32 overflow-hidden">
        
        {/* HERO SECTION */}
        <motion.section 
          initial="hidden" animate="show" variants={STAGGER}
          className="flex flex-col items-center text-center mt-12"
        >
          <motion.div variants={FADE_UP} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            Live Demo Ready
          </motion.div>
          
          <motion.h1 variants={FADE_UP} className="text-5xl md:text-7xl font-display font-bold tracking-tight text-white max-w-4xl leading-tight">
            Shop like you have <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-emerald-300">backup.</span>
          </motion.h1>
          
          <motion.p variants={FADE_UP} className="mt-6 text-xl text-gray-400 max-w-2xl leading-relaxed">
            The first ambient voice companion for e-commerce. Saheli shops Amazon.in with you, reads the reviews you skip, and physically intercepts bad buys.
          </motion.p>
          
          <motion.div variants={FADE_UP} className="mt-10 flex gap-4">
            <button className="glow bg-accent text-background px-8 py-4 rounded-full font-semibold flex items-center gap-2 hover:scale-105 transition-transform">
              <Phone className="w-5 h-5" />
              Call Saheli
            </button>
          </motion.div>
        </motion.section>

        {/* METRICS / THE PROBLEM */}
        <motion.section 
          initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={STAGGER}
        >
          <motion.div variants={FADE_UP} className="mb-12">
            <h2 className="text-3xl font-display font-semibold text-white">The E-commerce Blindspot</h2>
            <p className="text-gray-400 mt-2 text-lg">Metrics that kill margins, caused by an unserved trust gap.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            <motion.div variants={FADE_UP} className="glass-card rounded-2xl p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center border border-white/5">
                <ShoppingCart className="w-6 h-6 text-coral" />
              </div>
              <div className="mt-4">
                <span className="text-4xl font-display font-bold text-white block mb-2">75%</span>
                <h3 className="text-lg font-medium text-gray-200">Cart Abandonment</h3>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">Due to review fatigue and unresolved doubt on the product page. Not just price.</p>
              </div>
            </motion.div>

            <motion.div variants={FADE_UP} className="glass-card rounded-2xl p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center border border-white/5">
                <RotateCcw className="w-6 h-6 text-coral" />
              </div>
              <div className="mt-4">
                <span className="text-4xl font-display font-bold text-white block mb-2">20-30%</span>
                <h3 className="text-lg font-medium text-gray-200">Apparel Returns</h3>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">Driven primarily by missed sizing warnings buried deep in 4,000+ unread reviews.</p>
              </div>
            </motion.div>

            <motion.div variants={FADE_UP} className="glass-card rounded-2xl p-8 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center border border-white/5">
                <Clock className="w-6 h-6 text-coral" />
              </div>
              <div className="mt-4">
                <span className="text-4xl font-display font-bold text-white block mb-2">15 Min</span>
                <h3 className="text-lg font-medium text-gray-200">Decision Paralysis</h3>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">The average time users stall before taking screenshots to WhatsApp a friend.</p>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* THE ENGINE (HOW IT FIXES IT) */}
        <motion.section 
          initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={STAGGER}
        >
          <div className="glass-card rounded-3xl p-1 md:p-1 border border-accent/20 bg-gradient-to-b from-surface to-background relative overflow-hidden">
            <div className="absolute inset-0 bg-accent/5 opacity-50 blur-3xl"></div>
            
            <div className="relative p-10 md:p-16 flex flex-col items-center text-center">
              <motion.div variants={FADE_UP}>
                <ShieldCheck className="w-16 h-16 text-accent mb-6" />
              </motion.div>
              
              <motion.h2 variants={FADE_UP} className="text-3xl md:text-5xl font-display font-bold text-white mb-6">
                From Hours to 90 Seconds
              </motion.h2>
              
              <motion.p variants={FADE_UP} className="text-xl text-gray-400 max-w-2xl mb-12">
                Saheli isn't a chatbot. It's a live, tool-calling agent that acts as a decisive closer, turning hesitation into confident conversion.
              </motion.p>
              
              <div className="grid md:grid-cols-2 gap-8 w-full text-left">
                <motion.div variants={FADE_UP} className="p-6 rounded-2xl bg-surface/50 border border-white/5">
                  <TrendingUp className="w-6 h-6 text-accent mb-4" />
                  <h4 className="text-white font-medium text-lg mb-2">Conversion ↑</h4>
                  <p className="text-gray-400 text-sm">Drops the 75% abandonment rate by resolving trust issues live on the call. The hesitant buyer decides instead of bouncing.</p>
                </motion.div>
                
                <motion.div variants={FADE_UP} className="p-6 rounded-2xl bg-surface/50 border border-white/5">
                  <Activity className="w-6 h-6 text-accent mb-4" />
                  <h4 className="text-white font-medium text-lg mb-2">Returns ↓</h4>
                  <p className="text-gray-400 text-sm">Programmatically mines reviews for sizing discrepancies ("runs small") and actively talks the user out of bad buys before checkout.</p>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* B2B VISION */}
        <motion.section 
          initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={STAGGER}
          className="border-t border-white/10 pt-24"
        >
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div variants={FADE_UP}>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-6">
                The Trust Layer for Platforms
              </h2>
              <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                Voice is load-bearing. E-commerce optimizes for scale, but trust is built through honest dissuasion. 
              </p>
              <ul className="space-y-4">
                {[
                  "A B2B2C SDK to save millions in reverse logistics",
                  "Proactive nudges mid-browse",
                  "Multi-site adaptable (Flipkart, Myntra)",
                  "Built on a real behavioral insight, not a gimmick"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 min-w-4 w-4 h-4 rounded-full bg-accent/20 border border-accent/50 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                    </div>
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            
            <motion.div variants={FADE_UP} className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent blur-3xl opacity-30"></div>
              <div className="glass-card rounded-2xl p-8 border border-white/10 relative">
                <Smartphone className="w-10 h-10 text-white mb-6" />
                <div className="space-y-4">
                  <div className="h-4 bg-surface rounded-full w-3/4"></div>
                  <div className="h-4 bg-surface rounded-full w-full"></div>
                  <div className="h-4 bg-surface rounded-full w-5/6"></div>
                  <div className="pt-4 mt-4 border-t border-white/5">
                    <div className="inline-flex items-center gap-2 text-accent text-sm">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                      Saheli is listening...
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center text-sm text-gray-500">
        <p className="mb-4">Built with Bolna &middot; Cartesia &middot; Deepgram Flux &middot; GPT-4o &middot; Chrome MV3 + FastAPI</p>
        <p>© 2026 Saheli. The friend you call before you buy.</p>
      </footer>
    </div>
  );
}

export default App;
