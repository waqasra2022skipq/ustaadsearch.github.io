document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Simple Waitlist Form Handling (Frontend Demo)
    const form = document.querySelector('.waitlist-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = form.querySelector('input[type="email"]');
            const email = emailInput.value;
            
            if (email) {
                // Simulate API call
                const btn = form.querySelector('button');
                const originalText = btn.textContent;
                
                btn.textContent = 'Joining...';
                btn.disabled = true;
                
                setTimeout(() => {
                    btn.textContent = 'Joined! 🚀';
                    btn.style.backgroundColor = '#10b981';
                    emailInput.value = '';
                    
                    // Reset after 3 seconds
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.disabled = false;
                        btn.style.backgroundColor = '';
                    }, 3000);
                }, 1000);
            }
        });
    }

    // Header scroll effect
    const header = document.querySelector('.header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            header.style.background = 'rgba(255, 255, 255, 0.95)';
        } else {
            header.style.boxShadow = 'none';
            header.style.background = 'rgba(255, 255, 255, 0.8)';
        }
    });
});
