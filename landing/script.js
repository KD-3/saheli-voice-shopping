document.addEventListener("DOMContentLoaded", () => {
  // Intersection Observer for fade-in animations
  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // Only animate once
      }
    });
  }, observerOptions);

  const sections = document.querySelectorAll(".fade-in");
  sections.forEach(section => {
    observer.observe(section);
  });

  // Call Saheli button interaction
  const callBtn = document.getElementById("callBtn");
  if (callBtn) {
    callBtn.addEventListener("click", () => {
      // In a real integration, this would trigger the Bolna call or open the extension popup
      alert("This would trigger a live call to your phone via Bolna!\n\nFor the live demo, use the Chrome Extension's 'Call Saheli' button on Amazon.in.");
    });
  }
});
