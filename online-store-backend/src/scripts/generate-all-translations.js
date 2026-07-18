const fs = require('fs');
const path = require('path');
const { getDefaultLanguage } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);

// Translation mappings - simple but comprehensive
const TRANSLATIONS = {
  it: {
    // Common UI elements
    'Home': 'Home',
    'Products': 'Prodotti',
    'All Products': 'Tutti i Prodotti',
    'About Us': 'Chi Siamo',
    'Contact': 'Contatti',
    'Admin': 'Amministratore',
    'Profile': 'Profilo',
    'My Orders': 'I Miei Ordini',
    'Login': 'Accedi',
    'Logout': 'Esci',
    'Search': 'Ricerca',
    'Cart': 'Carrello',
    'Language': 'Lingua',
    'Loading': 'Caricamento in corso',
    'Loading...': 'Caricamento in corso...',
    'Loading...': 'Caricamento in corso...',
    'Saving...': 'Salvataggio in corso...',
    'Processing...': 'Elaborazione in corso...',
    'Cancel': 'Annulla',
    'Delete': 'Elimina',
    'Edit': 'Modifica',
    'Restore': 'Ripristina',
    'Back': 'Indietro',
    'Save': 'Salva',
    'Create': 'Crea',
    'Update': 'Aggiorna',
    'Add': 'Aggiungi',
    'Remove': 'Rimuovi',
    'Error': 'Errore',
    'Success': 'Successo',
    'Total': 'Totale',
    'Price': 'Prezzo',
    'Quantity': 'Quantità',
    'Email': 'Email',
    'Phone': 'Telefono',
    'Name': 'Nome',
    'Address': 'Indirizzo',
    'Status': 'Stato',
    'Active': 'Attivo',
    'Inactive': 'Inattivo',
  },
  es: {
    'Home': 'Inicio',
    'Products': 'Productos',
    'All Products': 'Todos los Productos',
    'About Us': 'Acerca de Nosotros',
    'Contact': 'Contacto',
    'Admin': 'Administrador',
    'Profile': 'Perfil',
    'My Orders': 'Mis Pedidos',
    'Login': 'Iniciar Sesión',
    'Logout': 'Cerrar Sesión',
    'Search': 'Buscar',
    'Cart': 'Carrito',
    'Language': 'Idioma',
    'Loading': 'Cargando',
    'Loading...': 'Cargando...',
    'Saving...': 'Guardando...',
    'Processing...': 'Procesando...',
    'Cancel': 'Cancelar',
    'Delete': 'Eliminar',
    'Edit': 'Editar',
    'Restore': 'Restaurar',
    'Back': 'Atrás',
    'Save': 'Guardar',
    'Create': 'Crear',
    'Update': 'Actualizar',
    'Add': 'Agregar',
    'Remove': 'Eliminar',
    'Error': 'Error',
    'Success': 'Éxito',
    'Total': 'Total',
    'Price': 'Precio',
    'Quantity': 'Cantidad',
    'Email': 'Correo Electrónico',
    'Phone': 'Teléfono',
    'Name': 'Nombre',
    'Address': 'Dirección',
    'Status': 'Estado',
    'Active': 'Activo',
    'Inactive': 'Inactivo',
  },
  nl: {
    'Home': 'Thuis',
    'Products': 'Producten',
    'All Products': 'Alle Producten',
    'About Us': 'Over Ons',
    'Contact': 'Contact',
    'Admin': 'Beheerder',
    'Profile': 'Profiel',
    'My Orders': 'Mijn Bestellingen',
    'Login': 'Inloggen',
    'Logout': 'Afmelden',
    'Search': 'Zoeken',
    'Cart': 'Winkelwagen',
    'Language': 'Taal',
    'Loading': 'Laden',
    'Loading...': 'Laden...',
    'Saving...': 'Opslaan...',
    'Processing...': 'Verwerken...',
    'Cancel': 'Annuleren',
    'Delete': 'Verwijderen',
    'Edit': 'Bewerken',
    'Restore': 'Herstellen',
    'Back': 'Terug',
    'Save': 'Opslaan',
    'Create': 'Aanmaken',
    'Update': 'Bijwerken',
    'Add': 'Toevoegen',
    'Remove': 'Verwijderen',
    'Error': 'Fout',
    'Success': 'Succes',
    'Total': 'Totaal',
    'Price': 'Prijs',
    'Quantity': 'Hoeveelheid',
    'Email': 'E-mailadres',
    'Phone': 'Telefoon',
    'Name': 'Naam',
    'Address': 'Adres',
    'Status': 'Status',
    'Active': 'Actief',
    'Inactive': 'Inactief',
  },
  sv: {
    'Home': 'Hem',
    'Products': 'Produkter',
    'All Products': 'Alla Produkter',
    'About Us': 'Om Oss',
    'Contact': 'Kontakt',
    'Admin': 'Administratör',
    'Profile': 'Profil',
    'My Orders': 'Mina Beställningar',
    'Login': 'Logga In',
    'Logout': 'Logga Ut',
    'Search': 'Sök',
    'Cart': 'Varukorg',
    'Language': 'Språk',
    'Loading': 'Laddar',
    'Loading...': 'Laddar...',
    'Saving...': 'Sparar...',
    'Processing...': 'Bearbetar...',
    'Cancel': 'Avbryt',
    'Delete': 'Ta Bort',
    'Edit': 'Redigera',
    'Restore': 'Återställ',
    'Back': 'Tillbaka',
    'Save': 'Spara',
    'Create': 'Skapa',
    'Update': 'Uppdatera',
    'Add': 'Lägg Till',
    'Remove': 'Ta Bort',
    'Error': 'Fel',
    'Success': 'Framgång',
    'Total': 'Totalt',
    'Price': 'Pris',
    'Quantity': 'Mängd',
    'Email': 'E-post',
    'Phone': 'Telefon',
    'Name': 'Namn',
    'Address': 'Adress',
    'Status': 'Status',
    'Active': 'Aktiv',
    'Inactive': 'Inaktiv',
  }
};

function getFilesToTranslate() {
  const files = fs.readdirSync(EN_DIR).filter(f => f.endsWith('.json'));
  return files;
}

function copyWithTranslationMarkers(obj, langCode) {
  // For development - copy structure and mark for translation
  const marker = langCode.toUpperCase();
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = value; // Keep original for now
    } else if (typeof value === 'object' && value !== null) {
      result[key] = copyWithTranslationMarkers(value, langCode);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  getFilesToTranslate,
  copyWithTranslationMarkers,
  ensureDirectoryExists,
  TRANSLATIONS
};
