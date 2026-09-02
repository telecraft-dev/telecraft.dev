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
 * A peak is telemetry arriving. The datum between peaks is the window with
 * nothing on it, which is why the datum is drawn under every line and why
 * the lines are stacked in register: a reading is what it is against the
 * line below it.
 *
 * So there are two streams here, not one. Both panels on this page are the
 * same estate the markup already writes down in words: metrics are composed,
 * the collector reports them running, and none of them reach the backend.
 * Intended and Effective draw every arrival. Observed draws every arrival
 * but the metrics, and sits on the datum where each of those should have
 * been. That hole is the verdict the panel prints underneath it, and a
 * reader who compares the rows finds it without being told which line to
 * look at.
 *
 * Nothing is read off a hue and nothing is read off the stroke: the stroke
 * still says only how a reading is taken, which is Intended continuous,
 * Effective segmented, Observed sampled, and that is `site.css` rather than
 * anything here.
 *
 * Nothing about an arrival is reused. Its silhouette, its height, its
 * length, the space before it and which signal it carries are all drawn
 * fresh, and the metrics that Observed never receives are kept off any
 * cycle a reader could count. There is no sequence here to come round
 * again, which is the only way a line this small stays worth watching.
 *
 * It starts on the frame the script runs and nothing is staged behind it.
 * The geometry in the markup is the geometry this starts from, so there is
 * no changeover to see: the page draws once, and what it drew was already
 * moving.
 *
 * Nothing here is fetched, imported or bundled: the site makes no external
 * request, and `tools/check-external-assets.mjs` fails the build if it ever
 * does.
 */

;(function () {
  /* The authored geometry is the resting state, and it is correct. Anybody
     who has asked for less motion keeps it.

     This is the whole of the answer to the movement, and it is a deliberate
     answer rather than an omission. A reader who wants it stopped stops it
     once, at their machine, for every site they open, and every line here
     honours that before it draws a frame. A button in the bar would be a
     second control for the same preference, offered on one site, that a
     reader has to find; the console has already measured what a bar costs
     when a control is added to it for something the reader has settled
     elsewhere. If a reason to put one on the page ever arrives, it belongs
     beside the theme, in the same shape, and it stops this loop by clearing
     `running`. */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  /* Everything that draws the estate whole, and everything that draws what
     reached the backend. The nameplate keeps the whole reading: it is the
     motif, not a measurement of anything. */
  var whole = document.querySelectorAll(
    '.pulse polyline, .trace-intended polyline, .trace-effective polyline'
  )
  var arrived = document.querySelectorAll('.trace-observed polyline')
  if (!whole.length && !arrived.length) return

  /* All seven share the viewBox the markup already draws in. */
  var DATUM = 12
  var SPAN = 240

  /* Drawn past both edges so the line is never seen to start or stop. The
     outer `svg` clips it. */
  var LEAD = 60

  /* viewBox units a second. Slow enough to read as an instrument at rest
     rather than a loading bar. */
  var SPEED = 26

  /* Metrics is the signal this estate composes, reports running, and never
     delivers. Nothing else about the three matters here. */
  var METRICS = 2

  /* One arrival, drawn fresh. Every number in it is redrawn each time, so no
     two arrivals share a silhouette: a reader learns the family and never
     the stamp. A spike first, at close to the same height either side of the
     datum, then swings that decay back onto it, which is the shape the
     markup already draws and the shape the mark is built from.

     Held between edges rather than left open: the tallest excursion has to
     stay inside a viewBox 24 units deep with a stroke drawn on it, and the
     longest arrival has to leave room for the gap after it. */
  function shape() {
    var nodes = [[0, 0]]
    var dev = 6 + Math.random() * 3
    var swings = 3 + (Math.random() < 0.45 ? 1 : 0)
    var x = 0

    for (var s = 0; s < swings; s++) {
      /* The spike is narrow and close to symmetrical; what follows it is
         wider and smaller, the way a reading settles. */
      x += s < 2 ? 5 + Math.random() * 3 : 7 + Math.random() * 5
      nodes.push([x, s % 2 === 0 ? dev : -dev])
      dev *= s === 0 ? 0.85 + Math.random() * 0.2 : 0.45 + Math.random() * 0.25
    }

    x += 7 + Math.random() * 5
    nodes.push([x, 0])
    return { nodes: nodes, span: x }
  }

  /* Which signal an arrival carries, kept off any cycle a reader could
     count. Never two metrics running, so Observed is never blank for two
     arrivals together, and never four without one, so the hole that is the
     whole point of the drawing is always about to come round again. Both
     bounds are on runs rather than on position, which is what keeps it
     irregular. */
  var since = 1

  function signal() {
    if (since >= 3 || (since >= 1 && Math.random() < 0.34)) {
      since = 0
      return METRICS
    }
    since++
    return Math.random() < 0.5 ? 0 : 1
  }

  /* The two arrivals the markup already draws, kept exactly, so the frame
     the script starts on is the picture that was on screen before it. They
     are two different silhouettes already. The second is a metrics arrival,
     which is why the authored Observed line is flat where the other two
     peak. */
  var beats = [
    {
      at: 68,
      nodes: [[0, 0], [8, 8], [16, -8], [24, 5], [32, -5], [40, 0]],
      span: 40,
      signal: 1
    },
    {
      at: 178,
      nodes: [[0, 0], [8, 7], [16, -7], [24, 0]],
      span: 24,
      signal: METRICS
    }
  ]
  var next = 178
  var phase = 0
  var last = 0
  var running = false
  var onScreen = []

  /* Thirty updates a second. At sixty the line moves under half a viewBox
     unit between frames, which is about a third of a pixel at the size a
     panel draws it, so half the work was buying nothing and spending every
     reader's battery on it. */
  var TICK = 1000 / 30
  var due = 0

  /* Arrivals far enough apart to be read one at a time, and never twice the
     same distance apart. One gap in five is long, which is what stops the
     rhythm sounding like a metronome, and none of them is long enough to
     empty the line: the widest an arrival and the gap behind it can measure
     together is still narrower than the view, so there is always something
     to watch. */
  function schedule(span) {
    var gap = 18 + Math.random() * 100
    if (Math.random() < 0.2) gap += 55
    next += span + gap
  }

  function ensure(upto) {
    while (next < upto) {
      var beat = shape()
      beat.at = next
      beat.signal = signal()
      beats.push(beat)
      schedule(beat.span)
    }
  }

  /* Any arrival wholly behind the left edge is never drawn again. */
  function prune() {
    var edge = phase - LEAD
    var keep = 0
    while (keep < beats.length && beats[keep].at + beats[keep].span < edge) keep++
    if (keep) beats = beats.slice(keep)
  }

  function round(n) {
    return Math.round(n * 10) / 10
  }

  /* `drop` is the signal this stream never receives. Passing nothing draws
     the estate whole. */
  function geometry(drop) {
    var points = []
    var first = null

    for (var b = 0; b < beats.length; b++) {
      var at = beats[b].at - phase
      if (at > SPAN + LEAD) break
      if (beats[b].signal === drop) continue
      var nodes = beats[b].nodes
      for (var n = 0; n < nodes.length; n++) {
        var x = at + nodes[n][0]
        if (first === null) first = x
        points.push(round(x) + ',' + round(DATUM - nodes[n][1]))
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
    requestAnimationFrame(frame)
    if (now < due) return
    due = now + TICK

    /* A tab that has been in the background comes back to one step, not to
       the whole time it was away. */
    var step = Math.min((now - last) / 1000, 0.05)
    last = now
    phase += step * SPEED

    prune()
    ensure(phase + SPAN + LEAD)

    var i
    var full = geometry(null)
    for (i = 0; i < whole.length; i++) whole[i].setAttribute('points', full)
    var short = geometry(METRICS)
    for (i = 0; i < arrived.length; i++) arrived[i].setAttribute('points', short)
  }

  function start() {
    if (running) return
    running = true
    last = performance.now()
    due = 0
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
  if ('IntersectionObserver' in window) {
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

  schedule(24)
  ensure(SPAN + LEAD)
})()
