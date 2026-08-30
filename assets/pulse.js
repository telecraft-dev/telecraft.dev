/*
 * The traces on the landing page, drawn live.
 *
 * Seven of them: the pulse beside the nameplate, the three readings inside
 * the hero panel, and the three the Validate band explains. The markup holds
 * an authored waveform for each, and a reader with no script, or one who has
 * asked for less motion, keeps exactly that. This file replaces the geometry
 * frame by frame so the lines run, which is the same rule the tabs, the theme
 * control and the panels follow: everything works first, and script only
 * makes it move.
 *
 * One geometry, seven strokes, which is what the markup already draws and
 * what this keeps. Every line takes the same points string on every frame,
 * because six of them are readings of one estate and the seventh is the
 * motif they are drawn from. The strokes are what tell the readings apart:
 * Intended is continuous, Effective is segmented, Observed is sampled. That
 * distinction is in `site.css` and nothing here touches it.
 *
 * Beats arrive at intervals that do not repeat, so the line never settles
 * into a loop a reader can learn. Between them the datum is flat, because a
 * quiet estate is quiet.
 *
 * Nothing here is fetched, imported or bundled: the site makes no external
 * request, and `tools/check-external-assets.mjs` fails the build if it ever
 * does.
 */

;(function () {
  /* The authored geometry is the resting state, and it is correct. Anybody
     who has asked for less motion keeps it. */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  var lines = document.querySelectorAll('.pulse polyline, .trace polyline')
  if (!lines.length) return

  /* All seven share the viewBox the markup already draws in. */
  var DATUM = 12
  var SPAN = 240

  /* Drawn past both edges so the line is never seen to start or stop. The
     outer `svg` clips it. */
  var LEAD = 60

  /* viewBox units a second. Slow enough to read as an instrument at rest
     rather than a loading bar. */
  var SPEED = 26

  /* One beat, as offsets along the line and deviations from the datum. This
     is the waveform the markup draws, kept exactly, so the moment the script
     takes over nothing about the shape changes. */
  var BEAT = [
    [0, 0],
    [8, 8],
    [16, -8],
    [24, 5],
    [32, -5],
    [40, 0]
  ]
  var WIDTH = 40

  /* The two beats the markup already draws, so the first frame is the
     picture that was on screen a moment before it. */
  var beats = [
    { at: 68, amp: 1, span: WIDTH },
    { at: 178, amp: 0.85, span: WIDTH }
  ]
  var next = 178
  var phase = 0
  var last = 0
  var running = false
  var ready = false
  var onScreen = []

  /* Beats far enough apart to be read one at a time, and never twice the
     same distance apart. One gap in five is long, which is what stops the
     rhythm sounding like a metronome, and none of them is long enough to
     empty the line: the widest spacing a beat can leave behind it is still
     narrower than the view, so there is always something to watch. */
  function schedule(span) {
    var gap = 20 + Math.random() * 70
    if (Math.random() < 0.2) gap += 50
    next += span + gap
  }

  /* Height and length both vary, because two beats measured off one estate
     are never the same size either. */
  function ensure(upto) {
    while (next < upto) {
      var beat = {
        at: next,
        amp: 0.55 + Math.random() * 0.6,
        span: WIDTH * (0.85 + Math.random() * 0.35)
      }
      beats.push(beat)
      schedule(beat.span)
    }
  }

  /* Anything wholly behind the left edge is never drawn again. */
  function prune() {
    var edge = phase - LEAD
    var keep = 0
    while (keep < beats.length && beats[keep].at + beats[keep].span < edge) keep++
    if (keep) beats = beats.slice(keep)
  }

  function round(n) {
    return Math.round(n * 10) / 10
  }

  function geometry() {
    var points = []
    var first = null

    for (var b = 0; b < beats.length; b++) {
      var at = beats[b].at - phase
      if (at > SPAN + LEAD) break
      var amp = beats[b].amp
      var scale = beats[b].span / WIDTH
      for (var n = 0; n < BEAT.length; n++) {
        var x = at + BEAT[n][0] * scale
        if (first === null) first = x
        points.push(round(x) + ',' + round(DATUM - BEAT[n][1] * amp))
      }
    }

    /* The datum either side, added only where a beat is not already
       straddling that edge. */
    if (first === null || first > -LEAD) points.unshift(-LEAD + ',' + DATUM)
    points.push(SPAN + LEAD + ',' + DATUM)
    return points.join(' ')
  }

  function frame(now) {
    if (!running) return

    /* A tab that has been in the background comes back to one step, not to
       the whole time it was away. */
    var step = Math.min((now - last) / 1000, 0.05)
    last = now
    phase += step * SPEED

    prune()
    ensure(phase + SPAN + LEAD)

    var points = geometry()
    for (var i = 0; i < lines.length; i++) lines[i].setAttribute('points', points)

    requestAnimationFrame(frame)
  }

  function start() {
    if (running || !ready) return
    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }

  function stop() {
    running = false
  }

  /* A line nobody can see costs nothing. Which lines those are is held as a
     list rather than as a count: the first callback reports every line at
     once, including the ones below the fold, and a count that took those as
     departures would be short by the number of them for the rest of the
     page's life. */
  var watching = 'IntersectionObserver' in window
  if (watching) {
    var watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var at = onScreen.indexOf(entry.target)
        if (entry.isIntersecting && at === -1) onScreen.push(entry.target)
        if (!entry.isIntersecting && at !== -1) onScreen.splice(at, 1)
      })
      if (onScreen.length) start()
      else stop()
    })
    Array.prototype.forEach.call(
      document.querySelectorAll('.pulse, .trace'),
      function (svg) {
        watch.observe(svg)
      }
    )
  } else {
    start()
  }

  /* Nothing runs until the pulse has drawn itself in, over the duration
     `site.css` authored. Holding the whole page for it means the geometry
     under that draw is the one the markup holds, and every line on the page
     comes alive in the same instant, which is what a set of readings taken
     off one estate should do. The attribute is what tells `site.css` to drop
     the stroke dash that performed the draw. */
  setTimeout(function () {
    ready = true
    document.documentElement.dataset.pulseLive = ''
    if (onScreen.length || !watching) start()
  }, 2400)

  schedule(WIDTH)
  ensure(SPAN + LEAD)
})()
