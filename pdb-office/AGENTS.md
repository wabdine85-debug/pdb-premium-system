# AGENTS.md

## Project Overview

This project is an internal business operating system for PDB Aesthetic Room.

The software is NOT a simple CRM.
It is intended to evolve into a modular internal platform including:

- CRM
- Customer management
- Invoice management
- Medical invoice workflows
- Membership management
- Treatment management
- Financial overview
- Reminder system
- Shopify integrations
- Salonized integrations
- Analytics
- Internal admin tools

The software must feel:
- premium
- minimal
- luxurious
- medical-aesthetic
- modern
- clean
- trustworthy

NO generic startup dashboard style.
NO colorful toy UI.
NO over-animated SaaS style.

The visual direction is:
Apple-like clarity meets luxury aesthetic clinic software.

---

# IMPORTANT DEVELOPMENT RULES

## NEVER DO FULL REWRITES

Do NOT unnecessarily rewrite the entire project.

Always:
- analyze existing architecture first
- preserve working functionality
- improve incrementally
- refactor carefully
- keep backward compatibility

Avoid destructive changes.

---

# CURRENT TECH STACK

Current:
- React
- JSX
- localStorage persistence

Planned:
- Next.js
- PostgreSQL
- Node.js backend
- Shopify integration
- API architecture

The system should always be developed in a way that future migration is easy.

---

# UI / DESIGN RULES

## Visual Style

The UI must look:
- elegant
- calm
- premium
- modern
- minimal
- medical
- high-end

Avoid:
- random gradients
- childish colors
- startup SaaS templates
- flashy UI
- gaming aesthetics

Preferred palette:
- white
- warm white
- soft beige
- champagne
- matte black
- subtle gray
- muted blue accents

Use:
- soft shadows
- clean spacing
- rounded corners
- professional typography
- minimal borders

Animations should be subtle and smooth.

---

# LANGUAGE

UI language:
- German

Code language:
- English

Variables/functions/components:
- English naming only

Avoid German variable names.

---

# COMPONENT ARCHITECTURE

Always:
- split large components into smaller reusable components
- avoid giant files
- create modular architecture
- separate:
  - UI
  - business logic
  - helpers
  - storage
  - invoice logic

Preferred structure:

/components
/modules
/services
/utils
/hooks
/types

---

# DATA ARCHITECTURE

Current storage:
- localStorage

BUT:
Code must be prepared for future migration to:
- PostgreSQL
- APIs
- server-side persistence

Avoid tightly coupling logic to localStorage.

Create storage abstraction where possible.

---

# INVOICE SYSTEM RULES

The invoice system is a core feature.

Support multiple invoice profiles/templates:

Examples:
- PDB Aesthetic Room
- Medical doctor invoices
- Future additional business entities

Each invoice profile must support:
- company/practice name
- address
- email
- tax number
- VAT ID
- IBAN
- BIC
- invoice prefix
- invoice numbering system
- logo
- invoice design template
- default tax rate

Invoices MUST reference an invoiceProfileId.

Invoice PDFs must dynamically use the selected invoice profile.

---

# CRM RULES

Customers may come from:
- Shopify
- Salonized
- manual creation

Duplicate detection is important.

Customer timeline/history is important.

Customer profile should evolve into:
- treatments
- memberships
- invoices
- notes
- loyalty
- bookings
- communication history

---

# SHOPIFY INTEGRATION RULES

Shopify is a future core integration.

Architecture should support:
- importing customers
- importing orders
- mapping treatments
- syncing memberships
- future webhook support

Do NOT hardcode Shopify-specific logic directly into UI components.

---

# CODE QUALITY

Always:
- write clean readable code
- avoid unnecessary dependencies
- avoid bloated libraries
- prefer native React solutions
- avoid duplicated logic
- avoid inline chaos

Refactor when needed.

---

# PERFORMANCE

Optimize for:
- fast loading
- smooth UI
- scalability
- maintainability

Avoid:
- unnecessary rerenders
- huge monolithic state
- deeply nested logic

---

# FUTURE FEATURES (DO NOT IMPLEMENT UNLESS REQUESTED)

Potential future modules:
- authentication
- user roles
- doctor accounts
- employee accounts
- Stripe
- SEPA
- recurring invoices
- appointment systems
- analytics
- AI integrations
- WhatsApp integrations
- email automations
- PDF exports
- DATEV export

Only implement features when explicitly requested.

---

# WORKFLOW RULES

IMPORTANT:
Always work in small safe steps.

When implementing:
1. analyze
2. plan
3. modify carefully
4. preserve compatibility
5. improve UX
6. avoid breaking changes

Do not overengineer.

Focus on:
- stability
- scalability
- premium UX
- maintainability

---

# FINAL GOAL

The final product should feel like:

A premium internal operating system for a luxury aesthetic clinic.

Not like:
- a template
- a startup toy
- a generic admin dashboard

The system should eventually be capable of running the entire internal workflow of PDB Aesthetic Room.