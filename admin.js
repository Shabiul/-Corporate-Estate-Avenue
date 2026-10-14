document.addEventListener('DOMContentLoaded', () => {
    
    // Auth State
    let adminToken = sessionStorage.getItem('cea_admin_token') || '';
    
    // DOM Elements
    const loginPanel = document.getElementById('js-login-panel');
    const dashboard = document.getElementById('js-dashboard');
    const loginForm = document.getElementById('js-login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const errorMsg = document.getElementById('js-error-msg');
    
    const welcomeMsg = document.getElementById('js-admin-welcome');
    const logoutBtn = document.getElementById('js-btn-logout');
    
    const statInquiries = document.getElementById('js-stat-inquiries');
    const statProperties = document.getElementById('js-stat-properties');
    
    const inquiriesTableBody = document.getElementById('js-inquiries-table-body');
    const inquiriesEmptyState = document.getElementById('js-inquiries-empty');
    const propertiesGrid = document.getElementById('js-properties-grid');
    const propertiesEmptyState = document.getElementById('js-properties-empty');
    
    const detailModal = document.getElementById('js-detail-modal');
    const modalCloseBtn = document.getElementById('js-close-modal');
    const modalTitle = document.getElementById('js-modal-title');
    const modalBody = document.getElementById('js-modal-body');
    
    const lightbox = document.getElementById('js-lightbox');
    const lightboxImg = document.getElementById('js-lightbox-img');
    const lightboxCloseBtn = document.getElementById('js-close-lightbox');
    const lightboxPrevBtn = document.getElementById('js-prev-lightbox');
    const lightboxNextBtn = document.getElementById('js-next-lightbox');
    
    // Lightbox image list tracking
    let currentLightboxImages = [];
    let currentLightboxIndex = 0;
    
    // Service mapping for badges
    const serviceLabels = {
        'pm': 'Property Management',
        'res': 'Residential Consulting',
        'comm': 'Commercial Services',
        'reloc': 'Corporate Relocation',
        'owner': 'Owner Representation',
        'client': 'Client Representation'
    };

    // Initialize View
    function initView() {
        if (adminToken) {
            loginPanel.style.display = 'none';
            dashboard.style.display = 'flex';
            document.body.style.alignItems = 'stretch';
            document.body.style.padding = '0';
            fetchDashboardData();
        } else {
            loginPanel.style.display = 'block';
            dashboard.style.display = 'none';
            document.body.style.alignItems = 'center';
            document.body.style.padding = '2rem 0';
        }
    }
    
    initView();

    // 1. LOGIN HANDLER
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            
            loginSubmitBtn.disabled = true;
            loginSubmitBtn.textContent = 'Verifying...';
            errorMsg.style.display = 'none';
            
            fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(res => {
                if (!res.ok) throw new Error('Invalid credentials');
                return res.json();
            })
            .then(data => {
                if (data.success && data.token) {
                    adminToken = data.token;
                    sessionStorage.setItem('cea_admin_token', adminToken);
                    showNotification('Authorization Granted. Welcome Back.');
                    loginForm.reset();
                    initView();
                }
            })
            .catch(err => {
                console.error(err);
                errorMsg.style.display = 'block';
            })
            .finally(() => {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = 'Authorize Entry';
            });
        });
    }

    // 2. LOGOUT HANDLER
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('cea_admin_token');
            adminToken = '';
            showNotification('Successfully logged out.');
            initView();
        });
    }

    // 3. TAB TOGGLING
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const targetPanel = document.getElementById(`panel-${targetTab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // 4. FETCH DATA
    function fetchDashboardData() {
        if (!adminToken) return;

        // Fetch Inquiries
        fetch('/api/admin/inquiries', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        })
        .then(res => {
            if (res.status === 401) handleUnauthorized();
            return res.json();
        })
        .then(data => {
            if (data.success) {
                renderInquiries(data.data);
                statInquiries.textContent = data.data.length;
            }
        })
        .catch(err => console.error('Error fetching inquiries:', err));

        // Fetch Properties
        fetch('/api/admin/properties', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        })
        .then(res => {
            if (res.status === 401) handleUnauthorized();
            return res.json();
        })
        .then(data => {
            if (data.success) {
                renderProperties(data.data);
                statProperties.textContent = data.data.length;
            }
        })
        .catch(err => console.error('Error fetching properties:', err));
    }

    function handleUnauthorized() {
        sessionStorage.removeItem('cea_admin_token');
        adminToken = '';
        initView();
        showNotification('Session expired. Please log in again.');
    }

    // 5. RENDER INQUIRIES
    function renderInquiries(inquiries) {
        if (!inquiriesTableBody) return;
        inquiriesTableBody.innerHTML = '';
        
        if (inquiries.length === 0) {
            inquiriesEmptyState.style.display = 'block';
            inquiriesTableBody.closest('.table-responsive').style.display = 'none';
            return;
        }
        
        inquiriesEmptyState.style.display = 'none';
        inquiriesTableBody.closest('.table-responsive').style.display = 'block';
        
        inquiries.forEach(inq => {
            const tr = document.createElement('tr');
            
            const serviceLabel = serviceLabels[inq.service] || inq.service || 'General Inquiry';
            const badgeClass = `badge-${inq.service || 'pm'}`;
            const dateStr = new Date(inq.created_at).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            tr.innerHTML = `
                <td><strong>${escapeHTML(inq.name)}</strong></td>
                <td><a href="mailto:${escapeHTML(inq.email)}" style="color: var(--color-gold); text-decoration: none;">${escapeHTML(inq.email)}</a></td>
                <td>${inq.phone ? escapeHTML(inq.phone) : '<span style="color: var(--color-text-muted)">-</span>'}</td>
                <td><span class="badge ${badgeClass}">${escapeHTML(serviceLabel)}</span></td>
                <td>${dateStr}</td>
                <td>
                    <div style="display:flex; gap: 0.5rem;">
                        <button class="btn-action btn-view-message" data-id="${inq.id}" data-name="${escapeHTML(inq.name)}" data-message="${escapeHTML(inq.message || 'No message provided.')}">View Details</button>
                        <button class="btn-action btn-action-delete btn-delete-inquiry" data-id="${inq.id}">Delete</button>
                    </div>
                </td>
            `;
            
            inquiriesTableBody.appendChild(tr);
        });

        // Add event listeners to view buttons
        document.querySelectorAll('.btn-view-message').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = btn.getAttribute('data-name');
                const message = btn.getAttribute('data-message');
                openDetailsModal(`Inquiry from ${name}`, message);
            });
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.btn-delete-inquiry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this inquiry?')) {
                    deleteInquiry(id);
                }
            });
        });
    }

    // Delete Inquiry handler
    function deleteInquiry(id) {
        fetch(`/api/admin/inquiries/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification('Inquiry deleted successfully.');
                fetchDashboardData();
            } else {
                showNotification(data.message || 'Failed to delete inquiry.');
            }
        })
        .catch(err => console.error(err));
    }

    // 6. RENDER PROPERTIES
    function renderProperties(properties) {
        if (!propertiesGrid) return;
        propertiesGrid.innerHTML = '';

        if (properties.length === 0) {
            propertiesEmptyState.style.display = 'block';
            propertiesGrid.style.display = 'none';
            return;
        }

        propertiesEmptyState.style.display = 'none';
        propertiesGrid.style.display = 'grid';

        properties.forEach(prop => {
            const card = document.createElement('article');
            card.className = 'property-card glass-panel prop-card';

            const firstImg = (prop.images && prop.images.length > 0) ? prop.images[0] : '';
            const imgCount = prop.images ? prop.images.length : 0;
            
            // Image box markup
            let imageBox = `
                <div class="prop-gallery-box">
                    <div style="color: var(--color-text-muted); font-size: 0.85rem;">No Uploaded Images</div>
                </div>
            `;
            if (firstImg) {
                imageBox = `
                    <div class="property-image-box prop-gallery-box">
                        <img src="${escapeHTML(firstImg)}" alt="${escapeHTML(prop.property_name)}" class="property-img prop-gallery-img" data-prop-id="${prop.id}">
                        <span class="property-tag" style="background: var(--color-gold); color: #fff; font-weight:700;">${escapeHTML(prop.property_type)}</span>
                        ${imgCount > 1 ? `<span class="prop-gallery-counter">1 of ${imgCount}</span>` : ''}
                    </div>
                `;
            }

            const dateStr = new Date(prop.created_at).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            card.innerHTML = `
                ${imageBox}
                <div class="property-content prop-info-box">
                    <div>
                        <div class="prop-type-badge">${escapeHTML(prop.property_type)}</div>
                        <h3 class="prop-name">${escapeHTML(prop.property_name)}</h3>
                        <div class="prop-location">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; color: var(--color-gold);"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>${escapeHTML(prop.property_location)}</span>
                        </div>
                        <div class="property-price" style="margin-bottom: 0.75rem;">₹ ${escapeHTML(prop.property_price)}</div>
                        
                        <div class="prop-meta-details">
                            <div class="meta-item">BHK/Area: <br><span>${escapeHTML(prop.property_bhk)}</span></div>
                            <div class="meta-item">Date Uploaded: <br><span>${dateStr}</span></div>
                        </div>

                        <div class="prop-owner-details">
                            <div class="owner-row">
                                <span class="owner-label">Owner:</span>
                                <span class="owner-val">${escapeHTML(prop.name)}</span>
                            </div>
                            <div class="owner-row">
                                <span class="owner-label">Phone:</span>
                                <span class="owner-val"><a href="tel:${escapeHTML(prop.phone)}" style="color:var(--color-text-primary); text-decoration:none;">${escapeHTML(prop.phone)}</a></span>
                            </div>
                            <div class="owner-row">
                                <span class="owner-label">Email:</span>
                                <span class="owner-val"><a href="mailto:${escapeHTML(prop.email)}" style="color:var(--color-gold); text-decoration:none;">${escapeHTML(prop.email)}</a></span>
                            </div>
                        </div>
                    </div>

                    <div class="prop-card-actions">
                        <button class="btn-action btn-card-full btn-view-desc" data-title="${escapeHTML(prop.property_name)}" data-desc="${escapeHTML(prop.property_description || 'No description provided.')}">View Details</button>
                        <button class="btn-action btn-action-delete btn-delete-prop" data-id="${prop.id}">Delete</button>
                    </div>
                </div>
            `;

            propertiesGrid.appendChild(card);

            // Add click listener on images for lightbox
            if (firstImg) {
                const imgElement = card.querySelector('.prop-gallery-img');
                imgElement.addEventListener('click', () => {
                    openLightbox(prop.images, 0);
                });
            }
        });

        // Add event listeners to view description buttons
        document.querySelectorAll('.btn-view-desc').forEach(btn => {
            btn.addEventListener('click', () => {
                const title = btn.getAttribute('data-title');
                const desc = btn.getAttribute('data-desc');
                openDetailsModal(`Property Details: ${title}`, desc);
            });
        });

        // Add event listeners to delete property buttons
        document.querySelectorAll('.btn-delete-prop').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this property listing? This will also remove its stored images.')) {
                    deleteProperty(id);
                }
            });
        });
    }

    // Delete Property handler
    function deleteProperty(id) {
        fetch(`/api/admin/properties/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification('Property listing and associated images deleted.');
                fetchDashboardData();
            } else {
                showNotification(data.message || 'Failed to delete property.');
            }
        })
        .catch(err => console.error(err));
    }

    // 7. LIGHTBOX CONTROLLER
    function openLightbox(imagesArray, startIndex) {
        if (!imagesArray || imagesArray.length === 0) return;
        currentLightboxImages = imagesArray;
        currentLightboxIndex = startIndex;
        
        updateLightboxImage();
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
    }

    function updateLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        const currentPath = currentLightboxImages[currentLightboxIndex];
        lightboxImg.src = currentPath;
        
        // Show/hide arrows based on count
        if (currentLightboxImages.length > 1) {
            lightboxPrevBtn.style.display = 'block';
            lightboxNextBtn.style.display = 'block';
        } else {
            lightboxPrevBtn.style.display = 'none';
            lightboxNextBtn.style.display = 'none';
        }
    }

    function nextLightboxImage() {
        currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
        updateLightboxImage();
    }

    function prevLightboxImage() {
        currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxImages.length) % currentLightboxImages.length;
        updateLightboxImage();
    }

    if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
    if (lightboxNextBtn) lightboxNextBtn.addEventListener('click', nextLightboxImage);
    if (lightboxPrevBtn) lightboxPrevBtn.addEventListener('click', prevLightboxImage);

    // Keyboard support for Lightbox
    window.addEventListener('keydown', (e) => {
        if (lightbox.classList.contains('open')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') nextLightboxImage();
            if (e.key === 'ArrowLeft') prevLightboxImage();
        }
    });

    // Close Lightbox clicking on backdrop
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === lightbox.querySelector('.lightbox-content')) {
            closeLightbox();
        }
    });

    // 8. MODAL WINDOW CONTROLS
    function openDetailsModal(title, text) {
        modalTitle.textContent = title;
        modalBody.innerHTML = `
            <h4>Message/Description:</h4>
            <p>${escapeHTML(text)}</p>
        `;
        detailModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeDetailsModal() {
        detailModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeDetailsModal);
    
    // Close modal clicking outside
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailsModal();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailModal.classList.contains('open')) {
            closeDetailsModal();
        }
    });

    // HTML Escape utility to prevent XSS injection
    function escapeHTML(str) {
        if (str == null || str === '') return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // TOAST NOTIFICATION SYSTEM
    function showNotification(message) {
        const existingToast = document.querySelector('.cea-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'cea-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animation frames
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 400);
        }, 4000);
    }
});
