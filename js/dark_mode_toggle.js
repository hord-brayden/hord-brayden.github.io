
function toggleDarkMode() {
  if (darkModeToggle.checked) {
    document.documentElement.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'enabled');
  } else {
    document.documentElement.classList.remove('dark-mode');
    localStorage.setItem('darkMode', null);
  }
}

const darkModeToggle = document.querySelector('#dark-mode-toggle-btn');
const darkMode = localStorage.getItem('darkMode');
const isOsDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// Set dark mode based on OS/user preference
if (isOsDarkMode || darkMode === 'enabled') {
    document.documentElement.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', toggleDarkMode);
