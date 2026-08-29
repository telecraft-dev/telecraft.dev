/*
 * The three panels on the landing page that do the thing they describe.
 *
 * Every one of them is progressive enhancement over content that is already
 * complete: the markup carries the composition as the renderer writes it, the
 * merge as git shows it, and the two verdicts as the console reports them. A
 * reader with no script gets all of that. This file hides the still picture
 * and puts a working one in its place, which is the same rule the tabs and
 * the theme control follow: a control that cannot act is worse than no
 * control.
 *
 * None of it is decoration. The lanes, the Allow-list, the checked claims,
 * the Cohorts and the cross are the model the product computes, drawn at the
 * size of a column. Where something moves, it moves because the thing it
 * stands for takes time.
 *
 * Nothing here is fetched, imported or bundled: the site makes no external
 * request, and `tools/check-external-assets.mjs` fails the build if it ever
 * does.
 */

;(function () {
  var still = matchMedia('(prefers-reduced-motion: reduce)')

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  function mark(paths, solid) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', solid ? 'mark mark-solid' : 'mark')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('aria-hidden', 'true')
    paths.forEach(function (d) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', d)
      svg.appendChild(p)
    })
    return svg
  }

  var MARKS = {
    met: [['M3 8.5 6.2 11.8 13 4.8'], false],
    unmet: [['M3.5 3.5 12.5 12.5', 'M12.5 3.5 3.5 12.5'], false],
    absent: [['M8 2.5 14 13H2Z'], true],
    foreign: [['M8 2.5 13.5 8 8 13.5 2.5 8Z'], false],
  }

  function markFor(name) {
    return mark(MARKS[name][0], MARKS[name][1])
  }

  /* Swaps the still picture for the working one. Called only once a panel has
     built something that works, so a panel that throws leaves the reader with
     the content that was already there. */
  function live(panel) {
    var target = panel.querySelector('[data-demo-live]')
    var stills = panel.querySelectorAll('[data-demo-static]')
    if (!target) return null
    Array.prototype.forEach.call(stills, function (s) {
      s.hidden = true
    })
    target.hidden = false
    return target
  }

  /* ---- 01, the composer ----
     A Team composes from the part of the Catalogue its Allow-list permits,
     and the Requirements the Blueprint claims are checked against what it
     actually contains. Taking k8sattributes out of a lane is the fastest way
     to see the second half of that sentence happen. */

  var CATALOGUE = [
    { id: 'otlp', kind: 'receiver' },
    { id: 'k8sattributes', kind: 'processor' },
    { id: 'memory_limiter', kind: 'processor' },
    { id: 'batch', kind: 'processor' },
    { id: 'filter', kind: 'processor' },
    { id: 'tail_sampling', kind: 'processor', signals: ['traces'] },
    { id: 'otlphttp', kind: 'exporter' },
  ]

  var TEAMS = [
    { key: 'platform', label: 'platform', allows: null },
    {
      key: 'basket',
      label: 'team/basket',
      allows: ['otlp', 'k8sattributes', 'memory_limiter', 'batch', 'otlphttp'],
    },
  ]

  var SIGNALS = ['traces', 'logs', 'metrics']

  function startLanes() {
    var lanes = {}
    SIGNALS.forEach(function (signal) {
      lanes[signal] = ['otlp', 'k8sattributes', 'batch', 'otlphttp']
    })
    return lanes
  }

  function has(lane, id) {
    return lane.indexOf(id) !== -1
  }

  var REQUIREMENTS = [
    {
      id: 'traces-to-primary',
      says: 'Traces reach the primary backend.',
      test: function (lanes) {
        var lane = lanes.traces
        return lane[lane.length - 1] === 'otlphttp'
      },
    },
    {
      id: 'resource-attributes-present',
      says: 'Every signal carries the attributes the estate requires.',
      test: function (lanes) {
        return SIGNALS.every(function (s) {
          return has(lanes[s], 'k8sattributes')
        })
      },
    },
    {
      id: 'no-unbatched-export',
      says: 'Nothing exports without batching first.',
      test: function (lanes) {
        return SIGNALS.every(function (s) {
          var lane = lanes[s]
          var batch = lane.indexOf('batch')
          var out = lane.indexOf('otlphttp')
          return out === -1 || (batch !== -1 && batch < out)
        })
      },
    },
  ]

  function composer(panel) {
    var root = live(panel)
    if (!root) return

    var lanes = startLanes()
    var team = TEAMS[0]
    var open = null

    var bar = el('div', 'demo-bar')
    bar.appendChild(el('span', 'demo-label', 'Composing as'))
    var choice = el('span', 'demo-choice')
    TEAMS.forEach(function (t) {
      var b = el('button', 'demo-opt', t.label)
      b.type = 'button'
      b.addEventListener('click', function () {
        team = t
        open = null
        draw()
      })
      t.button = b
      choice.appendChild(b)
    })
    bar.appendChild(choice)

    var lanesList = el('ul', 'lanes')
    var claimsList = el('ul', 'claims')
    var foot = el('p', 'demo-foot')
    var reset = el('button', 'demo-reset', 'Start again')
    reset.type = 'button'
    reset.addEventListener('click', function () {
      lanes = startLanes()
      open = null
      draw()
    })

    root.appendChild(bar)
    root.appendChild(lanesList)
    root.appendChild(claimsList)
    root.appendChild(foot)
    foot.appendChild(reset)

    function allowed(entry) {
      return !team.allows || team.allows.indexOf(entry.id) !== -1
    }

    function offer(signal) {
      return CATALOGUE.filter(function (entry) {
        if (entry.signals && entry.signals.indexOf(signal) === -1) return false
        return !has(lanes[signal], entry.id)
      })
    }

    function add(signal, id) {
      var lane = lanes[signal]
      var out = lane.indexOf('otlphttp')
      /* A Component goes in front of the exporter, because a lane is ordered
         and an exporter is the end of one. */
      if (out === -1) lane.push(id)
      else lane.splice(out, 0, id)
      open = null
      draw()
    }

    function draw() {
      TEAMS.forEach(function (t) {
        t.button.setAttribute('aria-pressed', t === team ? 'true' : 'false')
      })

      lanesList.textContent = ''
      SIGNALS.forEach(function (signal) {
        var row = el('li', 'lane')
        row.appendChild(el('span', 'lane-name', signal))

        var parts = el('ul', 'lane-parts')
        lanes[signal].forEach(function (id) {
          var item = el('li')
          var b = el('button', 'part', id)
          b.type = 'button'
          b.title = 'Take ' + id + ' out of ' + signal
          b.setAttribute('aria-label', 'Take ' + id + ' out of ' + signal)
          b.addEventListener('click', function () {
            lanes[signal] = lanes[signal].filter(function (x) {
              return x !== id
            })
            open = null
            draw()
          })
          item.appendChild(b)
          parts.appendChild(item)
        })

        var addItem = el('li')
        var plus = el('button', 'part part-add', '+')
        plus.type = 'button'
        plus.setAttribute('aria-label', 'Add a Component to ' + signal)
        plus.setAttribute('aria-expanded', open === signal ? 'true' : 'false')
        plus.addEventListener('click', function () {
          open = open === signal ? null : signal
          draw()
        })
        addItem.appendChild(plus)
        parts.appendChild(addItem)
        row.appendChild(parts)

        if (open === signal) {
          var palette = el('div', 'palette')
          palette.appendChild(
            el('p', 'demo-label', 'The Catalogue, as ' + team.label + ' may use it')
          )
          var offers = el('ul', 'palette-parts')
          offer(signal).forEach(function (entry) {
            var item = el('li')
            var b = el('button', 'part', entry.id)
            b.type = 'button'
            if (allowed(entry)) {
              b.addEventListener('click', function () {
                add(signal, entry.id)
              })
            } else {
              /* Outside the Allow-list, and said so rather than hidden: a
                 reader who cannot see why an entry is missing learns nothing
                 from its absence. The render is what enforces this; the
                 Palette only shows it. */
              b.disabled = true
              b.className = 'part part-barred'
              b.title = 'Outside this Team’s Allow-list'
            }
            item.appendChild(b)
            offers.appendChild(item)
          })
          if (!offers.childNodes.length) {
            offers.appendChild(el('li', 'demo-empty', 'Nothing left to add.'))
          }
          palette.appendChild(offers)
          row.appendChild(palette)
        }

        lanesList.appendChild(row)
      })

      claimsList.textContent = ''
      claimsList.appendChild(el('li', 'claims-head', 'satisfies'))
      REQUIREMENTS.forEach(function (req) {
        var met = req.test(lanes)
        var item = el('li', met ? 'claim' : 'claim claim-unmet')
        item.appendChild(markFor(met ? 'met' : 'unmet'))
        item.appendChild(el('span', 'claim-name', req.id))
        item.appendChild(el('span', 'claim-said', met ? req.says : 'Not met by this composition.'))
        claimsList.appendChild(item)
      })
    }

    draw()
  }

  /* ---- 02, the rollout ----
     A Rollout moves a Cohort at a time and each collector reports back what
     it is running, which is where an Effective reading comes from. It is a
     sequence, so a still picture of it is a picture of one moment. */

  var COHORTS = [
    { name: 'canary', nodes: ['edge-01'] },
    { name: 'first half', nodes: ['edge-02', 'edge-03', 'edge-04'] },
    { name: 'the rest', nodes: ['edge-05', 'edge-06', 'edge-07', 'edge-08'] },
  ]

  function rollout(panel) {
    var root = live(panel)
    if (!root) return

    var at = -1
    var timer = null

    var head = el('div', 'demo-bar')
    head.appendChild(el('span', 'demo-label', 'Rollout'))
    var run = el('button', 'demo-opt', 'Run it')
    run.type = 'button'
    head.appendChild(run)

    var list = el('ul', 'cohorts')
    var note = el('p', 'panel-note')

    root.appendChild(head)
    root.appendChild(list)
    root.appendChild(note)

    function draw() {
      list.textContent = ''
      COHORTS.forEach(function (cohort, index) {
        var row = el('li', 'cohort')
        row.appendChild(el('span', 'cohort-name', cohort.name))
        var nodes = el('ul', 'cohort-nodes')
        cohort.nodes.forEach(function (name) {
          var done = index <= at
          var item = el('li')
          var chip = el('span', done ? 'node node-done' : 'node', name)
          chip.appendChild(el('span', 'node-version', done ? 'v4' : 'v3'))
          item.appendChild(chip)
          nodes.appendChild(item)
        })
        row.appendChild(nodes)
        list.appendChild(row)
      })

      note.textContent = ''
      var done = at >= COHORTS.length - 1
      note.appendChild(markFor(done ? 'met' : 'absent'))
      note.appendChild(
        el(
          'span',
          null,
          at < 0
            ? 'Merged. Every collector still reports v3.'
            : done
              ? 'Every collector reports v4. That report is the Effective reading.'
              : 'Cohort ' + COHORTS[at].name + ' reports v4. The rest still report v3.'
        )
      )
      run.textContent = done ? 'Run it again' : at < 0 ? 'Run it' : 'Running'
      run.disabled = at >= 0 && !done
    }

    function step() {
      at += 1
      draw()
      if (at < COHORTS.length - 1) {
        timer = setTimeout(step, 900)
      }
    }

    run.addEventListener('click', function () {
      clearTimeout(timer)
      at = -1
      draw()
      /* A reader who asked not to be moved gets the end of the sequence
         rather than the sequence. */
      if (still.matches) {
        at = COHORTS.length - 1
        draw()
        return
      }
      timer = setTimeout(step, 400)
    })

    draw()
  }

  /* ---- 03, the cross ----
     Two facts in, one outcome out, per Requirement. The table this replaced
     had seven rows and asked the reader to learn it; four of those rows come
     out of two switches, and the reader turns them. */

  var OUTCOMES = {
    'yes|yes': {
      name: 'compliant',
      mark: 'met',
      said: 'The requirement is met.',
      owner: null,
    },
    'yes|no': {
      name: 'broken_pipeline',
      mark: 'unmet',
      said: 'Somebody configured this and it is not working.',
      owner: 'platform/ingest',
    },
    'no|no': {
      name: 'not_configured',
      mark: 'absent',
      said: 'Nobody configured it at all.',
      owner: 'own',
    },
    'no|yes': {
      name: 'ungoverned',
      mark: 'foreign',
      said: 'Telemetry is arriving from something nobody configured.',
      owner: 'own',
    },
  }

  function cross(group) {
    var cards = group.querySelectorAll('[data-service]')
    Array.prototype.forEach.call(cards, function (card) {
      var root = live(card)
      if (!root) return

      var state = {
        configured: card.dataset.configured,
        arriving: card.dataset.arriving,
      }
      var ownTeam = card.dataset.owner
      var verdict = card.querySelector('[data-verdict]')
      var said = card.querySelector('[data-verdict-said]')
      var ownerLine = card.querySelector('.panel-cost')
      var owner = card.querySelector('[data-verdict-owner]')

      function switcher(key, label) {
        var row = el('div', 'toggle')
        row.appendChild(el('span', 'toggle-name', label))
        var opts = el('span', 'toggle-opts')
        ;['yes', 'no'].forEach(function (value) {
          var b = el('button', 'toggle-opt', value)
          b.type = 'button'
          b.setAttribute('aria-label', label + ' ' + value)
          b.addEventListener('click', function () {
            state[key] = value
            draw()
          })
          b.dataset.value = value
          opts.appendChild(b)
        })
        row.appendChild(opts)
        return row
      }

      var configured = switcher('configured', 'configured')
      var arriving = switcher('arriving', 'arriving')
      root.appendChild(configured)
      root.appendChild(arriving)

      function draw() {
        ;[configured, arriving].forEach(function (row, index) {
          var key = index === 0 ? 'configured' : 'arriving'
          Array.prototype.forEach.call(row.querySelectorAll('.toggle-opt'), function (b) {
            b.setAttribute('aria-pressed', b.dataset.value === state[key] ? 'true' : 'false')
          })
        })

        var out = OUTCOMES[state.configured + '|' + state.arriving]
        verdict.textContent = ''
        verdict.appendChild(markFor(out.mark))
        var name = el('span', 'verdict-name', out.name)
        verdict.appendChild(name)
        said.textContent = out.said
        verdict.appendChild(said)
        if (out.owner) {
          ownerLine.hidden = false
          owner.textContent = out.owner === 'own' ? ownTeam : out.owner
        } else {
          ownerLine.hidden = true
        }
      }

      draw()
    })
  }

  var BUILD = { composer: composer, rollout: rollout, cross: cross }

  Array.prototype.forEach.call(document.querySelectorAll('[data-demo]'), function (node) {
    var build = BUILD[node.dataset.demo]
    if (build) build(node)
  })
})()
