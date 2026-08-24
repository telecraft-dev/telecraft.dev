/*
 * The theme, after the first paint (ADR-0047 §2).
 *
 * Three states, not two: `system`, `light` and `dark`. Following the machine
 * is the honest default and an on/off switch cannot express it, so the stored
 * value is the *choice* and `data-theme` on the root element is the
 * *resolution* of it. `tokens.css` defines every colour in exactly two blocks
 * (the bare `:root` carrying dark, and `:root[data-theme='light']`), so a
 * browser that never runs this file still renders a complete theme rather
 * than half of one.
 *
 * The first stamp is made by the inline copy of this logic in `index.html`,
 * which has to run before anything is painted and therefore cannot be this
 * file. The two agree by convention, as they do in the console, and they
 * share the storage key. Change one and change the other.
 *
 * The choice is a device preference, so it lives in `localStorage` and stays
 * out of the URL.
 */

;(function () {
  var STORAGE_KEY = 'telecraft.theme'
  var CHOICES = ['system', 'light', 'dark']

  // Storage throws rather than returning null in a browser with site data
  // disabled, and in that browser the theme is simply not remembered. A page
  // that will not render is a worse answer than one that forgets.
  function loadChoice() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY)
      return CHOICES.indexOf(stored) === -1 ? 'system' : stored
    } catch (error) {
      return 'system'
    }
  }

  function saveChoice(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch (error) {
      // Not remembering the choice is survivable; failing to apply it is not.
    }
  }

  // The light query, asked rather than assumed: dark is the ground state.
  var query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

  function apply(choice) {
    document.documentElement.dataset.theme =
      choice === 'system' ? (query && query.matches ? 'light' : 'dark') : choice
  }

  var control = document.getElementById('theme-choice')
  var choice = loadChoice()
  apply(choice)

  if (control) {
    control.value = choice
    control.closest('.theme-control').hidden = false
    control.addEventListener('change', function () {
      saveChoice(control.value)
      apply(control.value)
    })
  }

  // Re-resolve when the operating system changes, which only moves the page
  // while the choice is `system`.
  if (query) {
    query.addEventListener('change', function () {
      apply(loadChoice())
    })
  }
})()
