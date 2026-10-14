document.addEventListener('DOMContentLoaded', () => {
    
    // Helper: check if mobile viewport
    function isMobile() {
        return window.innerWidth <= 992;
    }

    // Helper: lock body scroll
    function lockBodyScroll(lock) {
        if (lock) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.dataset.scrollY = scrollY;
        } else {
            const scrollY = parseInt(document.body.dataset.scrollY || '0');
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        }
    }

    // 1. Dynamic Navbar Scroll Effect
    const navbarContainer = document.querySelector('.navbar-container');
    const scrollThreshold = 50;

    function handleNavbarScroll() {
        if (window.scrollY > scrollThreshold) {
            navbarContainer.classList.add('scrolled');
        } else {
            navbarContainer.classList.remove('scrolled');
        }
    }
    
    window.addEventListener('scroll', handleNavbarScroll, { passive: true });
    handleNavbarScroll();

    // 2. Mobile Hamburger Menu Toggle
    const navToggle = document.getElementById('js-nav-toggle');
    const navMenu = document.getElementById('js-nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (navToggle && navMenu) {
        function closeMobileMenu() {
            navMenu.classList.remove('open');
            navToggle.classList.remove('active');
            lockBodyScroll(false);
            const servicesDropdown = document.querySelector('.mega-menu.show');
            if (servicesDropdown) {
                servicesDropdown.classList.remove('show');
            }
        }

        navToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpening = !navMenu.classList.contains('open');
            navMenu.classList.toggle('open');
            navToggle.classList.toggle('active');
            lockBodyScroll(isOpening);
        });

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.classList.contains('dropdown-toggle') && isMobile()) {
                    e.preventDefault();
                    const megaMenu = link.nextElementSibling;
                    if (megaMenu) {
                        megaMenu.classList.toggle('show');
                        link.classList.toggle('active-dropdown');
                    }
                    return;
                }
                closeMobileMenu();
            });
        });

        const megaMenuItems = document.querySelectorAll('.mega-menu-item');
        megaMenuItems.forEach(item => {
            item.addEventListener('click', () => {
                if (isMobile()) {
                    closeMobileMenu();
                }
            });
        });
    }

    // 3. ScrollSpy: Highlight Active Link on Scroll
    const sections = [];
    navLinks.forEach(link => {
        const targetId = link.getAttribute('href');
        if (targetId && targetId.startsWith('#')) {
            const section = document.querySelector(targetId);
            if (section) {
                sections.push({ link, section });
            }
        }
    });

    function scrollSpy() {
        const isAtBottom = (window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 10;
        if (isAtBottom && sections.length > 0) {
            navLinks.forEach(l => l.classList.remove('active'));
            sections[sections.length - 1].link.classList.add('active');
            return;
        }

        const scrollPosition = window.scrollY + window.innerHeight / 3;

        sections.forEach(({ link, section }) => {
            const rect = section.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const height = rect.height;

            if (scrollPosition >= top && scrollPosition < top + height) {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }
    
    window.addEventListener('scroll', scrollSpy);
    scrollSpy(); // Run once on load to highlight active section

    // 4. Parallax Background Hover (Desktop only)
    const heroBg = document.querySelector('.hero-bg');
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (heroBg && !isTouchDevice) {
        window.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const { innerWidth, innerHeight } = window;
            
            const moveX = (clientX / innerWidth) - 0.5;
            const moveY = (clientY / innerHeight) - 0.5;
            
            const translateX = moveX * -15; 
            const translateY = moveY * -15;
            
            heroBg.style.transform = `scale(1.05) translate(${translateX}px, ${translateY}px)`;
        });
    }

    // 5. Contact Form Submission Handling
    const contactForm = document.getElementById('js-contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const submitBtn = contactForm.querySelector('.btn-submit');
            const originalBtnText = submitBtn.textContent;
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const service = document.getElementById('service').value;
            const message = document.getElementById('message').value;

            // Set loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending Inquiry...';
            
            fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, phone, service, message })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification(`Thank you, ${name}! Your inquiry has been sent to Sajjad Pasha.`);
                    contactForm.reset();
                } else {
                    showNotification(data.message || 'Something went wrong. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error submitting contact form:', error);
                showNotification('Network error. Please check your connection and try again.');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            });
        });
    }

    // Toast Notification System
    function showNotification(message) {
        const existingToast = document.querySelector('.cea-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'cea-toast';
        toast.textContent = message;
        
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '6rem',
            left: '50%',
            transform: 'translateX(-50%) translateY(20px)',
            width: 'max-content',
            maxWidth: 'calc(100vw - 32px)',
            background: '#0F1F24',
            color: '#FFFFFF',
            borderLeft: '4px solid #0B6E63',
            padding: '0.9rem 1.25rem',
            borderRadius: '12px',
            fontSize: '0.9375rem',
            lineHeight: '1.45',
            fontWeight: '600',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            boxShadow: '0 12px 32px rgba(15, 31, 36, 0.25)',
            zIndex: '10000',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        });

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => {
                toast.remove();
            }, 400);
        }, 4000);
    }

    // 6. Upload Property Modal Controls
    const uploadModal = document.getElementById('js-upload-modal');
    const modalCloseBtn = document.getElementById('js-modal-close');
    const uploadTriggers = document.querySelectorAll('.trigger-upload');
    const uploadForm = document.getElementById('js-upload-form');
    
    let uploadedFilesList = [];

    function openUploadModal(e) {
        if (e) e.preventDefault();
        if (uploadModal) {
            uploadModal.classList.add('open');
            uploadModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            
            // Also close mobile drawer if open
            if (navMenu && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                if (navToggle) navToggle.classList.remove('active');
                const servicesDropdown = document.querySelector('.mega-menu');
                if (servicesDropdown) {
                    servicesDropdown.classList.remove('show');
                }
            }
        }
    }

    function closeUploadModal() {
        if (uploadModal) {
            uploadModal.classList.remove('open');
            uploadModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (uploadForm) uploadForm.reset();
            uploadedFilesList = [];
            renderFilePreviews();
        }
    }

    uploadTriggers.forEach(trigger => {
        trigger.addEventListener('click', openUploadModal);
    });

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeUploadModal);
    }

    if (uploadModal) {
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) {
                closeUploadModal();
            }
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && uploadModal && uploadModal.classList.contains('open')) {
            closeUploadModal();
        }
    });

    // Drag and Drop Zone Interaction
    const dragDropArea = document.getElementById('js-drag-drop-area');
    const fileInput = document.getElementById('uploader-files');
    const filePreviewGrid = document.getElementById('js-file-preview-grid');

    if (dragDropArea && fileInput) {
        dragDropArea.addEventListener('click', (e) => {
            if (e.target !== fileInput) {
                fileInput.click();
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dragDropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragDropArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dragDropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragDropArea.classList.remove('drag-over');
            }, false);
        });

        dragDropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleUploadedFiles(files);
        });

        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            handleUploadedFiles(files);
        });
    }

    function handleUploadedFiles(files) {
        const maxFiles = 5;
        
        Array.from(files).forEach(file => {
            if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) {
                showNotification("Only JPG, PNG, WebP or GIF images are allowed.");
                return;
            }
            if (uploadedFilesList.length >= maxFiles) {
                showNotification("You can upload a maximum of 5 images.");
                return;
            }
            
            const isDuplicate = uploadedFilesList.some(f => f.name === file.name && f.size === file.size);
            if (!isDuplicate) {
                uploadedFilesList.push(file);
            }
        });
        
        renderFilePreviews();
        if (fileInput) fileInput.value = '';
    }

    function renderFilePreviews() {
        if (!filePreviewGrid) return;
        filePreviewGrid.innerHTML = '';

        uploadedFilesList.forEach((file, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item';

            const img = document.createElement('img');
            img.alt = file.name;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'file-preview-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.setAttribute('aria-label', `Remove file ${file.name}`);
            
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                uploadedFilesList.splice(index, 1);
                renderFilePreviews();
            });

            previewItem.appendChild(img);
            previewItem.appendChild(removeBtn);
            filePreviewGrid.appendChild(previewItem);
        });
    }

    // Modal Form Submission
    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const submitBtn = uploadForm.querySelector('.btn-submit-modal');
            const originalBtnText = submitBtn.textContent;

            const name = document.getElementById('uploader-name').value;
            const propName = document.getElementById('property-name').value;

            // Set loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading Property...';

            // Build form data
            const formData = new FormData();
            formData.append('name', name);
            formData.append('phone', document.getElementById('uploader-phone').value);
            formData.append('email', document.getElementById('uploader-email').value);
            formData.append('property-type', document.getElementById('property-type').value);
            formData.append('property-name', propName);
            formData.append('property-location', document.getElementById('property-location').value);
            formData.append('property-bhk', document.getElementById('property-bhk').value);
            formData.append('property-price', document.getElementById('property-price').value);
            formData.append('property-description', document.getElementById('property-description').value);

            // Append uploaded files
            uploadedFilesList.forEach((file) => {
                formData.append('images', file);
            });

            fetch('/api/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification(`Thank you, ${name}! Your property '${propName}' has been uploaded successfully for review.`);
                    closeUploadModal();
                } else {
                    showNotification(data.message || 'Failed to upload property.');
                }
            })
            .catch(error => {
                console.error('Error uploading property:', error);
                showNotification('Network error occurred during upload. Please try again.');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            });
        });
    }

    // 7. BHK Filter Tabs (Buy Property)
    const filterTabs = document.querySelectorAll('.filter-tab');
    const buyCards = document.querySelectorAll('#js-buy-grid .property-card');

    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const selectedBhk = tab.getAttribute('data-bhk');

            buyCards.forEach(card => {
                if (selectedBhk === 'all' || card.getAttribute('data-bhk') === selectedBhk) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // 8. Multi-Step Property Listing Wizard
    const wizardForm = document.getElementById('js-wizard-form');
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const wizardPanels = document.querySelectorAll('.wizard-panel');
    const wizardProgress = document.getElementById('js-wizard-progress');
    const prevBtn = document.getElementById('js-wizard-prev');
    const nextBtn = document.getElementById('js-wizard-next');
    const submitBtn = document.getElementById('js-wizard-submit');
    let currentStep = 1;
    const totalSteps = 5;
    let wizardFiles = [];

    // Drag & Drop for Wizard
    const wizardDragDrop = document.getElementById('js-wizard-drag-drop');
    const wizardFileInput = document.getElementById('js-wizard-files');
    const wizardPreviewGrid = document.getElementById('js-wizard-preview');

    if (wizardDragDrop && wizardFileInput) {
        wizardDragDrop.addEventListener('click', (e) => {
            if (e.target !== wizardFileInput) wizardFileInput.click();
        });

        ['dragenter', 'dragover'].forEach(ev => {
            wizardDragDrop.addEventListener(ev, (e) => {
                e.preventDefault();
                wizardDragDrop.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(ev => {
            wizardDragDrop.addEventListener(ev, (e) => {
                e.preventDefault();
                wizardDragDrop.classList.remove('drag-over');
            }, false);
        });

        wizardDragDrop.addEventListener('drop', (e) => handleWizardFiles(e.dataTransfer.files));
        wizardFileInput.addEventListener('change', (e) => handleWizardFiles(e.target.files));
    }

    function handleWizardFiles(files) {
        Array.from(files).forEach(file => {
            if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) {
                showNotification('Only JPG, PNG, WebP or GIF images are allowed.');
                return;
            }
            if (wizardFiles.length >= 5) {
                showNotification('You can upload a maximum of 5 images.');
                return;
            }
            const isDup = wizardFiles.some(f => f.name === file.name && f.size === file.size);
            if (!isDup) wizardFiles.push(file);
        });
        renderWizardPreviews();
        if (wizardFileInput) wizardFileInput.value = '';
    }

    function renderWizardPreviews() {
        if (!wizardPreviewGrid) return;
        wizardPreviewGrid.innerHTML = '';
        wizardFiles.forEach((file, index) => {
            const el = document.createElement('div');
            el.className = 'file-preview-item';
            const img = document.createElement('img');
            img.alt = file.name;
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(file);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'file-preview-remove';
            btn.innerHTML = '&times;';
            btn.setAttribute('aria-label', `Remove ${file.name}`);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                wizardFiles.splice(index, 1);
                renderWizardPreviews();
            });
            el.appendChild(img);
            el.appendChild(btn);
            wizardPreviewGrid.appendChild(el);
        });
    }

    function updateWizard(step) {
        currentStep = step;
        wizardPanels.forEach(p => p.classList.remove('active'));
        document.querySelector(`.wizard-panel[data-step="${step}"]`).classList.add('active');

        wizardSteps.forEach(s => {
            s.classList.remove('active', 'completed');
            const sNum = parseInt(s.getAttribute('data-step'));
            if (sNum === step) s.classList.add('active');
            else if (sNum < step) s.classList.add('completed');
        });

        const pct = ((step - 1) / (totalSteps - 1)) * 100;
        if (wizardProgress) wizardProgress.style.width = pct + '%';

        if (prevBtn) {
            prevBtn.classList.toggle('visible', step > 1);
        }
        if (nextBtn) nextBtn.style.display = step === totalSteps ? 'none' : '';
        if (submitBtn) submitBtn.style.display = step === totalSteps ? '' : 'none';

        // Scroll to top of wizard
        const container = document.getElementById('js-wizard-container');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function validateStep(step) {
        const panel = document.querySelector(`.wizard-panel[data-step="${step}"]`);
        const required = panel.querySelectorAll('[required]');
        let valid = true;
        required.forEach(el => {
            el.style.borderColor = '';
            if (!el.value.trim()) {
                el.style.borderColor = '#e74c3c';
                valid = false;
            }
        });
        if (!valid) {
            showNotification('Please fill in all required fields.');
            return false;
        }

        // Step 2: at least some fields should be filled
        if (step === 2) {
            const area = document.getElementById('wiz-area');
            if (area && !area.value.trim()) {
                area.style.borderColor = '#e74c3c';
                showNotification('Please enter the total area.');
                return false;
            }
        }

        return true;
    }

    function escapeHTML(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function buildReview() {
        const reviewContainer = document.getElementById('js-wizard-review-content');
        if (!reviewContainer) return;

        const fields = [
            { label: 'Transaction', id: 'wiz-transaction', type: 'radio' },
            { label: 'Category', id: 'wiz-category', type: 'radio' },
            { label: 'Property Name', id: 'wiz-property-name', type: 'text' },
            { label: 'Location', id: 'wiz-location', type: 'text' },
            { label: 'BHK', id: 'wiz-bhk', type: 'text' },
            { label: 'Bathrooms', id: 'wiz-bathrooms', type: 'text' },
            { label: 'Furnishing', id: 'wiz-furnishing', type: 'text' },
            { label: 'Area', id: 'wiz-area', type: 'text' },
            { label: 'Floor', id: 'wiz-floor', type: 'text' },
            { label: 'Property Age', id: 'wiz-age', type: 'radio' },
        ];

        let html = '';
        fields.forEach(f => {
            let val = '';
            if (f.type === 'radio') {
                const checked = document.querySelector(`input[name="${f.id}"]:checked`);
                val = checked ? checked.value : 'Not selected';
            } else {
                const el = document.getElementById(f.id);
                val = el ? el.value || 'Not provided' : 'Not provided';
            }
            html += `<div class="wizard-review-item">
                <span class="wizard-review-item-label">${f.label}</span>
                <span class="wizard-review-item-value">${escapeHTML(val)}</span>
            </div>`;
        });

        // Add amenities
        const checkedAmenities = document.querySelectorAll('input[name="wiz-amenities"]:checked');
        const amenityValues = Array.from(checkedAmenities).map(c => c.value);
        html += `<div class="wizard-review-item">
            <span class="wizard-review-item-label">Amenities</span>
            <span class="wizard-review-item-value">${amenityValues.length ? escapeHTML(amenityValues.join(', ')) : 'None selected'}</span>
        </div>`;

        // Add photos count
        html += `<div class="wizard-review-item">
            <span class="wizard-review-item-label">Photos</span>
            <span class="wizard-review-item-value">${wizardFiles.length} image(s) uploaded</span>
        </div>`;

        // Add contact fields
        ['wiz-name', 'wiz-phone', 'wiz-email', 'wiz-price'].forEach(id => {
            const el = document.getElementById(id);
            const label = id.replace('wiz-', '').replace(/-/g, ' ');
            html += `<div class="wizard-review-item">
                <span class="wizard-review-item-label">${label.charAt(0).toUpperCase() + label.slice(1)}</span>
                <span class="wizard-review-item-value">${el ? escapeHTML(el.value) || 'Not provided' : 'Not provided'}</span>
            </div>`;
        });

        reviewContainer.innerHTML = html;
    }

    // Next Button
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (!validateStep(currentStep)) return;

            if (currentStep === 4) {
                // Build the review on transition to step 5
                buildReview();
            }

            if (currentStep < totalSteps) updateWizard(currentStep + 1);
        });
    }

    // Prev Button
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentStep > 1) updateWizard(currentStep - 1);
        });
    }

    // Click on step indicators (only completed steps)
    wizardSteps.forEach(s => {
        s.addEventListener('click', () => {
            const step = parseInt(s.getAttribute('data-step'));
            if (step < currentStep) {
                updateWizard(step);
            }
        });
    });

    // Form Submission
    if (wizardForm) {
        wizardForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const btn = submitBtn;
            const origText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Submitting...';

            const description = document.getElementById('wiz-description');
            const transaction = document.querySelector('input[name="wiz-transaction"]:checked');
            const category = document.querySelector('input[name="wiz-category"]:checked');
            const age = document.querySelector('input[name="wiz-age"]:checked');
            const amenities = document.querySelectorAll('input[name="wiz-amenities"]:checked');
            const amenityList = Array.from(amenities).map(c => c.value).join(', ');

            const formData = new FormData();
            formData.append('name', document.getElementById('wiz-name').value);
            formData.append('phone', document.getElementById('wiz-phone').value);
            formData.append('email', document.getElementById('wiz-email').value);
            formData.append('property-type', category ? category.value + ' - ' + (document.getElementById('wiz-bhk').value || 'N/A') : '');
            formData.append('property-name', document.getElementById('wiz-property-name').value);
            formData.append('property-location', document.getElementById('wiz-location').value);
            formData.append('property-bhk', document.getElementById('wiz-bhk').value + ' | ' + document.getElementById('wiz-area').value + ' sq.ft');
            formData.append('property-price', document.getElementById('wiz-price').value);
            formData.append('property-description', (description ? description.value : '') + '\n\nTransaction: ' + (transaction ? transaction.value : '') + '\nCategory: ' + (category ? category.value : '') + '\nFurnishing: ' + (document.getElementById('wiz-furnishing').value || 'N/A') + '\nFloor: ' + (document.getElementById('wiz-floor').value || 'N/A') + '\nAge: ' + (age ? age.value : 'N/A') + '\nBathrooms: ' + (document.getElementById('wiz-bathrooms').value || 'N/A') + '\nAmenities: ' + amenityList);

            wizardFiles.forEach(f => formData.append('images', f));

            fetch('/api/upload', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        showNotification('Your property has been submitted for review. Our team will contact you shortly.');
                        wizardForm.reset();
                        wizardFiles = [];
                        renderWizardPreviews();
                        updateWizard(1);
                    } else {
                        showNotification(data.message || 'Failed to submit property.');
                    }
                })
                .catch(() => showNotification('Network error. Please try again.'))
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = origText;
                });
        });
    }

    // Clear validation styling on input
    document.querySelectorAll('.wizard-panel input, .wizard-panel select, .wizard-panel textarea').forEach(el => {
        el.addEventListener('input', () => {
            el.style.borderColor = '';
            // Contact fields live on the same step as the review, so keep it in sync
            if (el.closest('.wizard-panel[data-step="5"]')) buildReview();
        });
        el.addEventListener('change', () => { el.style.borderColor = ''; });
    });

    // 10. Responsive Resize Handler
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!isMobile() && navMenu && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                navToggle.classList.remove('active');
                lockBodyScroll(false);
            }
            handleNavbarScroll();
        }, 250);
    });

    // 11. Orientation change handler
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (!isMobile() && navMenu && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                navToggle.classList.remove('active');
                lockBodyScroll(false);
            }
        }, 300);
    });

    // 12. Safe area padding for iPhone notch
    function applySafeAreaPadding() {
        const floatingBox = document.querySelector('.floating-social-box');
        if (floatingBox && CSS.supports('padding', 'env(safe-area-inset-bottom)')) {
            floatingBox.style.paddingBottom = 'env(safe-area-inset-bottom)';
            floatingBox.style.paddingRight = 'env(safe-area-inset-right)';
        }
    }
    applySafeAreaPadding();

    // 13. Touch support: disable hover on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch-device');
    }

    // 14. Animated Stats Counter
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statNumbers.length > 0 && 'IntersectionObserver' in window) {
        let countersStarted = false;

        function easeOutQuart(t) {
            return 1 - Math.pow(1 - t, 4);
        }

        function animateCounter(el, target, duration) {
            const start = performance.now();
            function step(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const value = Math.round(easeOutQuart(progress) * target);
                el.textContent = value;
                if (progress < 1) requestAnimationFrame(step);
                else el.textContent = target;
            }
            requestAnimationFrame(step);
        }

        const statsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !countersStarted) {
                    countersStarted = true;
                    statNumbers.forEach(el => {
                        const target = parseInt(el.dataset.target, 10);
                        animateCounter(el, target, 1800);
                    });
                }
            });
        }, { threshold: 0.4 });

        const statsSection = document.querySelector('.stats-section');
        if (statsSection) statsObserver.observe(statsSection);
    }

    // Console Branding
    console.log(
        '%cCorporate Estate Avenue%c\nPremium Property Management & Real Estate Consulting',
        'color: #d4af37; font-size: 20px; font-weight: bold; font-family: sans-serif;',
        'color: #a1a1aa; font-size: 14px; font-family: sans-serif;'
    );
});
