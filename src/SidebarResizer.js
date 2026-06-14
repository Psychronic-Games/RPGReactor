// SidebarResizer.js - Handles resizable sidebar sections with drag handles
class SidebarResizer {
    constructor() {
        this.resizeHandles = [];
        this.dragState = null;
        this.storageKey = 'rpg-reactor-sidebar-sizes';

        // Bind methods
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
    }

    initialize() {
        // Find all resize handles
        this.resizeHandles = document.querySelectorAll('.resize-handle');

        // Attach event listeners to each handle
        this.resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', this.onMouseDown);
        });

        // Initialize sections with proper flex values
        this.initializeSectionFlexValues();

        // Load saved sizes from localStorage (this will override default values)
        this.loadSavedSizes();

        // Show resize handles when their corresponding sections are visible
        this.updateHandleVisibility();
    }

    initializeSectionFlexValues() {
        const sections = document.querySelectorAll('.resizable-section');
        sections.forEach((section, index) => {
            if (section.style.display !== 'none') {
                const isLast = this.isLastVisibleSection(section);
                if (isLast) {
                    // Last visible section should be flexible
                    const minHeight = parseInt(section.style.minHeight) || 100;
                    section.style.flex = `1 1 ${minHeight}px`;
                }
                // Other sections keep their default flex values from HTML
            }
        });
    }

    updateHandleVisibility() {
        this.resizeHandles.forEach(handle => {
            const targetId = handle.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);

            if (targetSection && targetSection.style.display !== 'none') {
                handle.style.display = 'block';
            } else {
                handle.style.display = 'none';
            }
        });
    }

    onMouseDown(event) {
        event.preventDefault();

        const handle = event.target;
        const targetId = handle.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);

        if (!targetSection) return;

        // Get the next visible section for calculating constraints
        let nextSection = handle.nextElementSibling;
        while (nextSection && (nextSection.classList.contains('resize-handle') || nextSection.style.display === 'none')) {
            nextSection = nextSection.nextElementSibling;
        }

        this.dragState = {
            handle,
            targetSection,
            nextSection,
            startY: event.clientY,
            startHeight: targetSection.offsetHeight,
            nextStartHeight: nextSection ? nextSection.offsetHeight : 0
        };

        handle.classList.add('dragging');
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);

        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
    }

    onMouseMove(event) {
        if (!this.dragState) return;

        const deltaY = event.clientY - this.dragState.startY;
        const newHeight = this.dragState.startHeight + deltaY;

        // Get minimum height from style or default to 100px
        const minHeight = parseInt(this.dragState.targetSection.style.minHeight) || 100;
        const nextMinHeight = this.dragState.nextSection ?
            (parseInt(this.dragState.nextSection.style.minHeight) || 100) : 0;

        // Calculate new height for next section
        const nextNewHeight = this.dragState.nextStartHeight - deltaY;

        // Apply constraints
        if (newHeight >= minHeight && (!this.dragState.nextSection || nextNewHeight >= nextMinHeight)) {
            // Set the target section to explicit height
            this.dragState.targetSection.style.flex = `0 0 ${newHeight}px`;

            if (this.dragState.nextSection) {
                // Check if this is the last visible section
                const isLastSection = this.isLastVisibleSection(this.dragState.nextSection);

                if (isLastSection) {
                    // Last section should be flexible to fill remaining space
                    this.dragState.nextSection.style.flex = `1 1 ${nextMinHeight}px`;
                } else {
                    // Not the last section, use explicit height
                    this.dragState.nextSection.style.flex = `0 0 ${nextNewHeight}px`;
                }
            }
        }
    }

    isLastVisibleSection(section) {
        let nextSibling = section.nextElementSibling;
        while (nextSibling) {
            if (nextSibling.classList.contains('resizable-section') &&
                nextSibling.style.display !== 'none') {
                return false; // Found another visible section after this one
            }
            nextSibling = nextSibling.nextElementSibling;
        }
        return true; // No visible sections after this one
    }

    onMouseUp(event) {
        if (!this.dragState) return;

        this.dragState.handle.classList.remove('dragging');
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.body.style.userSelect = '';

        // Save the new sizes
        this.saveSizes();

        this.dragState = null;
    }

    saveSizes() {
        const sizes = {};
        const sections = document.querySelectorAll('.resizable-section');

        sections.forEach(section => {
            if (section.id && section.style.display !== 'none') {
                // Save the flex value
                sizes[section.id] = section.style.flex;
            }
        });

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(sizes));
        } catch (e) {
            console.warn('Failed to save sidebar sizes to localStorage:', e);
        }
    }

    loadSavedSizes() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (!saved) return;

            const sizes = JSON.parse(saved);

            // Only apply saved sizes to sections that are currently visible
            // Hidden sections will get their sizes when they become visible via refresh()
            Object.keys(sizes).forEach(sectionId => {
                const section = document.getElementById(sectionId);
                if (section && sizes[sectionId] && section.style.display !== 'none') {
                    section.style.flex = sizes[sectionId];
                }
            });
        } catch (e) {
            console.warn('Failed to load sidebar sizes from localStorage:', e);
        }
    }

    // Call this when sections are shown/hidden to update handle visibility
    refresh() {
        this.initializeSectionFlexValues();
        this.updateHandleVisibility();
    }

    destroy() {
        this.resizeHandles.forEach(handle => {
            handle.removeEventListener('mousedown', this.onMouseDown);
        });

        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }
}
