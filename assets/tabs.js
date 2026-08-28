/*
 * The deployment tabs on the landing page.
 *
 * Both panels are in the document and both are readable with no script at
 * all: each carries its own heading and the tab list is `hidden` in the
 * markup. This file is what turns two stacked sections into a choice, and it
 * is the only thing that hides anything. A control that cannot act is worse
 * than no control, which is the same rule the theme control follows.
 *
 * Nothing here is fetched, imported or bundled: the site makes no external
 * request, and `tools/check-external-assets.mjs` fails the build if it ever
 * does.
 */

;(function () {
  var groups = document.querySelectorAll('[data-tabs]')

  Array.prototype.forEach.call(groups, function (group) {
    var list = group.querySelector('[role="tablist"]')
    if (!list) return

    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'))
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute('aria-controls'))
    })

    /* Every tab needs its panel. A missing one means the markup and this file
       have drifted, and half a tab strip is worse than the stacked sections
       the reader already has. */
    if (!tabs.length || panels.indexOf(null) !== -1) return

    /* Marks the group as enhanced, which is what `site.css` reads to drop the
       per-panel headings the tab labels now carry. */
    group.dataset.tabsReady = ''
    list.hidden = false

    function select(index, moveFocus) {
      tabs.forEach(function (tab, at) {
        var chosen = at === index
        tab.setAttribute('aria-selected', chosen ? 'true' : 'false')
        /* Only the selected tab is in the tab order. Arrow keys move between
           them, which is what a tab list is expected to do. */
        tab.tabIndex = chosen ? 0 : -1
        panels[at].hidden = !chosen
      })
      if (moveFocus) tabs[index].focus()
    }

    tabs.forEach(function (tab, at) {
      tab.addEventListener('click', function () {
        select(at, false)
      })

      tab.addEventListener('keydown', function (event) {
        var next = null
        if (event.key === 'ArrowRight') next = (at + 1) % tabs.length
        if (event.key === 'ArrowLeft') next = (at - 1 + tabs.length) % tabs.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = tabs.length - 1
        if (next === null) return
        event.preventDefault()
        select(next, true)
      })
    })

    /* Whichever tab the markup marked selected, so the choice lives in one
       place. */
    var initial = tabs.findIndex(function (tab) {
      return tab.getAttribute('aria-selected') === 'true'
    })
    select(initial === -1 ? 0 : initial, false)
  })
})()
