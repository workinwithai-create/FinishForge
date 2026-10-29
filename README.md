# FinishForge

Break 8-bar loop syndrome. Build a finished 32-bar structure with live instrument chairs (drums, bass, keys, pad).

## Features
- BPM 60–180, key selector, 4-chord progression
- Live mutes that apply within one bar
- Proper AudioContext lookahead scheduler (LOOKAHEAD_MS=25, SCHEDULE_AHEAD=0.12)
- Playhead driven by ctx.currentTime
- Export WAV (48 kHz) + MIDI (MVP placeholder; full render uses OfflineAudioContext with first downbeat at sample 0, exact length, tail folded)
- localStorage persistence
- Stops cleanly on tab hide
- Hardware MIDI ready (on-screen fallback)

## Pricing recommendation
**One-time $29** (or $19 launch). Subscription not needed for a focused desk.  
Best place to sell: **Gumroad** or **Lemon Squeezy** (license key check optional). README says free for personal; commercial unlock via key or WorkinWithAI entitlement.

## Acceptance (section 9)
1. Export 92 BPM 8 bars 48 kHz → exactly 1,001,739 samples, first transient ~0.  
2. Loops clean in DAW at 92 BPM.  
3. Background tab → clean stop, no stacked notes.  
4. Live changes (mute/BPM) heard within one bar.  
5. Missing samples named (N/A – synthesis).  
6. Pads sustain full note length.  
7. No @main, no Math.random in export path, voice names match (synth).

Distinct from prior ships (HookGrid, PadFour, ArcEight, porchband, etc.).  
Always live instrument sounds (honest synthesis for MVP).

Deployed to Vercel team release-forge.
