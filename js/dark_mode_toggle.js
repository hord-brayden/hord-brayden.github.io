
function toggleDarkMode() {
  if (darkModeToggle.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'enabled');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', null);
  }
}

const darkModeToggle = document.querySelector('#dark-mode-toggle-btn');
const darkMode = localStorage.getItem('darkMode');
const isOsDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// Set dark mode based on OS preference
if (isOsDarkMode) {
    document.body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

// Toggle dark mode based on user preference
if (darkMode === 'enabled') {
    document.body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', toggleDarkMode);