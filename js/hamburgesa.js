document.querySelector('.hamburger-menu').addEventListener('click', function() {
  const navUl = document.querySelector('nav ul');
  if (navUl.style.display === "flex") {
    navUl.style.display = "none";
  } else {
    navUl.style.display = "flex";
  }
});