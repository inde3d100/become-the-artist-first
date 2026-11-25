/* The band: four voices on one clock. The conga, the campana and the bass play recorded sounds.
   The clave is a synthetic sound. Each recorded voice has a synthetic voice for the case that its sound is not there. */
(function (LG) {
  "use strict";

  const STEPS = 16;
  const COUNTS_PER_MINUTE = 150;
  const STEP_SECONDS = 60 / COUNTS_PER_MINUTE / 2;
  const LOOK_AHEAD_SECONDS = 0.12;
  const TIMER_MS = 25;
  const START_DELAY_SECONDS = 0.08;
  const LATE_SECONDS = 0.05;
  const REST_AFTER_MS = 400;
  const MASTER_LEVEL = 0.8;
  const SOFT = 1;
  const HIT = 2;
  const CONGA_SLAPS = [2, 10];
  const BASS_NOTES = { 3: 82.41, 6: 82.41, 11: 123.47, 14: 110 };
  const PATTERNS = {
    conga: [1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 2],
    clave: [0, 0, 2, 0, 2, 0, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0],
    campana: [2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1],
    bass: [0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 2, 0],
  };
  const NAMES = Object.keys(PATTERNS);
  /* The recorded sounds, from assets/sounds/kit.js. */
  const SOUNDS = window.LG_SOUNDS || {};
  /* The tumbao of the conga: the stroke of each step. Two takes of one stroke follow each other.
     The list has one stroke for each step of PATTERNS.conga. A change of that pattern needs a change here. */
  const CONGA_STROKES = [
    "heel-a", "toe-a", "slap", "toe-b", "heel-b", "toe-a", "open-a", "open-b",
    "heel-a", "toe-b", "slap", "toe-a", "heel-b", "toe-b", "open-a", "open-b",
  ];
  const CONGA_LEVELS = { heel: 0.26, toe: 0.3, slap: 0.65, open: 0.7 };
  /* The open tone and the bell get a pitch that agrees with the notes of the bass. */
  const CONGA_OPEN_HZ = 220;
  const CAMPANA = { low: { level: 0.45, hz: 493.88 }, high: { level: 0.26, hz: 739.99 } };
  const BASS_SOUNDS = { 3: "bass-e", 6: "bass-e", 11: "bass-b", 14: "bass-a" };
  const BASS_LEVEL = 0.8;
  /* A new bass note stops the note before it, as on one string. */
  const BASS_STOP_SECONDS = 0.02;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let buses = {};
  let kit = {};
  let bassBefore = null;
  let live = [];
  let enabled = { conga: true, clave: false, campana: false, bass: false };
  let playing = false;
  let restTimer = 0;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let origin = 0;
  let level = 1;

  function shape(gain, time, peak, decay) {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  }

  function tone(spec, time, out) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.from, time);
    if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, time + 0.05);
    shape(gain, time, spec.peak, spec.decay);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + spec.decay + 0.05);
  }

  function noise(spec, time, out) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = spec.filter;
    filter.frequency.value = spec.freq;
    shape(gain, time, spec.peak, spec.decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(time);
    source.stop(time + spec.decay + 0.05);
  }

  /* The synthetic voices. */
  const synth = {
    clave: function (time, strength, index, out) {
      tone({ type: "triangle", from: 2450, peak: 0.6, decay: 0.07 }, time, out);
      tone({ type: "sine", from: 1225, peak: 0.2, decay: 0.05 }, time, out);
    },
    conga: function (time, strength, index, out) {
      if (strength === SOFT) {
        tone({ type: "sine", from: 190, to: 150, peak: 0.14, decay: 0.07 }, time, out);
        noise({ filter: "lowpass", freq: 900, peak: 0.05, decay: 0.03 }, time, out);
        return;
      }
      if (CONGA_SLAPS.indexOf(index) !== -1) {
        tone({ type: "triangle", from: 430, to: 330, peak: 0.45, decay: 0.09 }, time, out);
        noise({ filter: "bandpass", freq: 1900, peak: 0.3, decay: 0.05 }, time, out);
        return;
      }
      tone({ type: "sine", from: 262, to: 205, peak: 0.8, decay: 0.3 }, time, out);
      noise({ filter: "lowpass", freq: 1400, peak: 0.1, decay: 0.02 }, time, out);
    },
    campana: function (time, strength, index, out) {
      const low = strength === HIT;
      const base = low ? 540 : 720;
      const peak = low ? 0.22 : 0.07;
      const decay = low ? 0.32 : 0.1;
      tone({ type: "square", from: base, peak: peak, decay: decay }, time, out);
      tone({ type: "square", from: base * 1.48, peak: peak, decay: decay }, time, out);
    },
    bass: function (time, strength, index, out) {
      tone({ type: "triangle", from: BASS_NOTES[index], peak: 0.8, decay: 0.36 }, time, out);
    },
  };

  /* One recorded sound: its 16-bit samples become a buffer of the sound engine. */
  function bufferOf(sound) {
    const bytes = window.atob(sound.data);
    const count = bytes.length >> 1;
    const buffer = ctx.createBuffer(1, count, sound.rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < count; i += 1) {
      const value = bytes.charCodeAt(2 * i) | (bytes.charCodeAt(2 * i + 1) << 8);
      channel[i] = (value < 0x8000 ? value : value - 0x10000) / 0x8000;
    }
    return buffer;
  }

  /* A sound that the page cannot read is left out. Its synthetic voice plays then. */
  function loadKit() {
    return Object.keys(SOUNDS).reduce(function (all, name) {
      try {
        return Object.assign({}, all, { [name]: { buffer: bufferOf(SOUNDS[name]), pitch: SOUNDS[name].pitch } });
      } catch (err) {
        return all;
      }
    }, {});
  }

  /* The engine keeps each recorded sound that still plays, so it can stop that sound. */
  function keep(source) {
    live = live.concat(source);
    source.addEventListener("ended", function () {
      live = live.filter(function (item) {
        return item !== source;
      });
    });
  }

  /* Plays one recorded sound. spec.hz gives it a new pitch. The result is its level control, or null without the sound. */
  function hit(name, spec, time, out) {
    const sound = kit[name];
    if (!sound) return null;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = sound.buffer;
    if (spec.hz && sound.pitch) source.playbackRate.value = spec.hz / sound.pitch;
    gain.gain.value = spec.level;
    source.connect(gain);
    gain.connect(out);
    source.start(time);
    keep(source);
    return gain;
  }

  /* The recorded voices. A voice gives null when its sound is not there. */
  const recorded = {
    conga: function (time, strength, index, out) {
      const stroke = CONGA_STROKES[index];
      const kind = stroke.split("-")[0];
      const hz = kind === "open" ? CONGA_OPEN_HZ : 0;
      return hit("conga-" + stroke, { level: CONGA_LEVELS[kind], hz: hz }, time, out);
    },
    campana: function (time, strength, index, out) {
      const kind = strength === HIT ? "low" : "high";
      return hit("campana-" + kind, CAMPANA[kind], time, out);
    },
    bass: function (time, strength, index, out) {
      const note = hit(BASS_SOUNDS[index], { level: BASS_LEVEL, hz: BASS_NOTES[index] }, time, out);
      if (!note) return null;
      if (bassBefore) bassBefore.gain.setTargetAtTime(0, time, BASS_STOP_SECONDS);
      bassBefore = note;
      return note;
    },
  };

  /* A recorded sound goes straight to the level control of its voice. A synthetic sound goes through the filter. */
  function voice(name, time, strength, index) {
    const bus = buses[name];
    const done = recorded[name] ? recorded[name](time, strength, index, bus.gain) : null;
    if (!done) synth[name](time, strength, index, bus.input);
  }

  function filterFor(name) {
    if (name !== "campana" && name !== "bass") return null;
    const filter = ctx.createBiquadFilter();
    filter.type = name === "bass" ? "lowpass" : "bandpass";
    filter.frequency.value = name === "bass" ? 520 : 1700;
    filter.Q.value = name === "bass" ? 0.7 : 1.1;
    return filter;
  }

  function makeBus(name) {
    const gain = ctx.createGain();
    const filter = filterFor(name);
    gain.gain.value = enabled[name] ? 1 : 0;
    gain.connect(master);
    if (filter) filter.connect(gain);
    return { input: filter || gain, gain: gain };
  }

  function build() {
    const compressor = ctx.createDynamicsCompressor();
    const samples = ctx.sampleRate;
    master = ctx.createGain();
    master.gain.value = MASTER_LEVEL * level;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, samples, samples);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) channel[i] = Math.random() * 2 - 1;
    buses = NAMES.reduce(function (all, name) {
      return Object.assign({}, all, { [name]: makeBus(name) });
    }, {});
    kit = loadKit();
  }

  /* After a stall the late steps are left out. The count stays in phase. */
  function skipLate() {
    const late = ctx.currentTime - nextTime;
    if (late < LATE_SECONDS) return;
    const missed = Math.ceil(late / STEP_SECONDS);
    nextTime += missed * STEP_SECONDS;
    step = (step + missed) % STEPS;
  }

  function schedule() {
    skipLate();
    while (nextTime < ctx.currentTime + LOOK_AHEAD_SECONDS) {
      const index = step;
      const time = nextTime;
      NAMES.forEach(function (name) {
        const strength = PATTERNS[name][index];
        if (strength && enabled[name]) voice(name, time, strength, index);
      });
      nextTime += STEP_SECONDS;
      step = (step + 1) % STEPS;
    }
  }

  function start() {
    if (!AudioContextClass || playing) return;
    window.clearTimeout(restTimer);
    if (!ctx) {
      ctx = new AudioContextClass();
      build();
    }
    ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(MASTER_LEVEL * level, ctx.currentTime, 0.05);
    origin = ctx.currentTime + START_DELAY_SECONDS;
    nextTime = origin;
    step = 0;
    playing = true;
    timer = window.setInterval(schedule, TIMER_MS);
    schedule();
    LG.emit("sound", true);
  }

  function stop() {
    if (!playing) return;
    window.clearInterval(timer);
    playing = false;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    /* The last bass note is long. It must not sound after the next start. */
    if (bassBefore) bassBefore.gain.setTargetAtTime(0, ctx.currentTime, BASS_STOP_SECONDS);
    bassBefore = null;
    window.clearTimeout(restTimer);
    restTimer = window.setTimeout(rest, REST_AFTER_MS);
    LG.emit("sound", false);
  }

  /* The sound engine stops after the fade, so it uses no power in silence.
     A recorded sound that still plays stops also. If not, its end sounds at the next start. */
  function rest() {
    if (playing || !ctx || ctx.state !== "running") return;
    live.forEach(function (source) {
      source.stop();
    });
    live = [];
    ctx.suspend();
  }

  function setVoice(name, on) {
    if (!(name in enabled)) return;
    enabled = Object.assign({}, enabled, { [name]: Boolean(on) });
    if (ctx) buses[name].gain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.03);
    LG.emit("mix", enabled);
  }

  function setMix(list) {
    NAMES.forEach(function (name) {
      setVoice(name, list.indexOf(name) !== -1);
    });
  }

  /* 1 is the normal level. 0 is silence: the pause beat uses it. */
  function setLevel(next) {
    level = next;
    if (ctx && playing) master.gain.setTargetAtTime(MASTER_LEVEL * level, ctx.currentTime, 0.3);
  }

  /* The place in the pattern as a step with a fraction, or -1 without sound. */
  function position() {
    if (!playing) return -1;
    /* The speakers play a little late. The picture waits for them. */
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const steps = (heard - origin) / STEP_SECONDS;
    return steps < 0 ? 0 : steps % STEPS;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
  });

  LG.audio = {
    supported: Boolean(AudioContextClass),
    names: NAMES,
    patterns: PATTERNS,
    steps: STEPS,
    stepSeconds: STEP_SECONDS,
    start: start,
    stop: stop,
    setVoice: setVoice,
    setMix: setMix,
    setLevel: setLevel,
    position: position,
    isPlaying: function () {
      return playing;
    },
    isEnabled: function (name) {
      return Boolean(enabled[name]);
    },
  };
})(window.LG);
