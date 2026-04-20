// Deine Salonized-Widget URLs für die verschiedenen Kategorien
const URL_PURE = "https://palais-de-beaute.salonized.com/widget_bookings/new?widget_id=tS4JGAsj5UPfn2ZHw4f3w9mV";
const URL_DEFINE = "https://palais-de-beaute.salonized.com/widget_bookings/new?widget_id=WkRVgSs9P1sgfgf6Gr8sbXpt";
const URL_BEYOND = "https://palais-de-beaute.salonized.com/widget_bookings/new?widget_id=tfDuRGc6jXKUp2P3tGVQa2Kt";

export const treatments = [
  // --- PURE CATEGORY (100er IDs) ---
  { id: 101, treatment_key: "laser-kleine-zone", title: "Laser Haarentfernung – kleine Zone", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 102, treatment_key: "kleine-gesichtsbehandlung", title: "Kleine Gesichtsbehandlung", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 103, treatment_key: "aquafacial", title: "Aquafacial", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 104, treatment_key: "lymphdrainage", title: "Lymphdrainage", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 105, treatment_key: "dermaplaning", title: "Dermaplaning", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 106, treatment_key: "gesichtsmassage", title: "Gesichtsmassage", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 107, treatment_key: "microdermabrasion", title: "Microdermabrasion", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 108, treatment_key: "hautaufhellung", title: "Hautaufhellung", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 109, treatment_key: "matrix-lifting-mask", title: "Matrix Lifting Mask", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 110, treatment_key: "pinkwax-eine-zone", title: "Pinkwax – eine Zone", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 111, treatment_key: "refit", title: "Refit", category_key: "pure", salonized_url: URL_PURE, is_active: true },
  { id: 112, treatment_key: "madero-gesicht-hals-deko", title: "Madero – Gesicht, Hals oder Dekolleté", category_key: "pure", salonized_url: URL_PURE, is_active: true },

  // --- DEFINE CATEGORY (200er IDs) ---
  { id: 201, treatment_key: "kryolipolyse", title: "Kryolipolyse", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 202, treatment_key: "ems-sella", title: "Ems-Sella Stuhl", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 203, treatment_key: "microneedling", title: "Microneedling", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 204, treatment_key: "ems-sculpt-neo", title: "Ems-Sculpt Neo", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 205, treatment_key: "aknebehandlung", title: "Aknebehandlung", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 206, treatment_key: "hautverjuengung", title: "Hautverjüngung", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 207, treatment_key: "oxy-geneo", title: "Oxy Geneo", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 208, treatment_key: "radiofrequenz", title: "Radiofrequenz", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 209, treatment_key: "g8-cellulite", title: "G8 Cellulite", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 210, treatment_key: "motus-pro-deka-gross", title: "MOTUS PRO DEKA® – Haarentfernung große Zone", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 211, treatment_key: "forma-inmode", title: "FORMA by INMODE™ – Gesicht, Hals oder Dekolleté", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 212, treatment_key: "hydrafacial-signature", title: "HYDRAFACIAL® Signature", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 213, treatment_key: "ultraschall-titan", title: "Ultraschall Titan – Gesicht, Hals oder Dekolleté", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 214, treatment_key: "circadia-premium", title: "CIRCADIA® Premium Treatments", category_key: "define", salonized_url: URL_DEFINE, is_active: true },
  { id: 215, treatment_key: "carbon-laser-peeling", title: "Carbon Laser Peeling", category_key: "define", salonized_url: URL_DEFINE, is_active: true },

  // --- BEYOND CATEGORY (300er IDs) ---
  { id: 301, treatment_key: "morpheus8-gesicht", title: "Morpheus8 – Gesichtsareal", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 302, treatment_key: "motus-pro-deka-ganzkoerper", title: "MOTUS PRO DEKA® – Laser Haarentfernung Ganzkörper", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 303, treatment_key: "hifu-gesicht", title: "HIFU – Gesicht, Hals oder Dekolleté", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 304, treatment_key: "redtouch-pro", title: "RedTouch PRO", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 305, treatment_key: "hydrafacial-meets-forma", title: "HydraFacial meets Forma", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 306, treatment_key: "exosomen", title: "Exosomen", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 307, treatment_key: "polynukleotide", title: "Polynukleotide", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 308, treatment_key: "medical-needling", title: "Medical Needling", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true },
  { id: 309, treatment_key: "meso-peel-md", title: "MESO PEEL® MD", category_key: "beyond", salonized_url: URL_BEYOND, is_active: true }
];