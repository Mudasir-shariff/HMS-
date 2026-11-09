/**
 * Standard Clinical Medication Formulary
 * Clinical medicines catalog for OPD doctor prescribing
 */

export interface ClinicalMedicine {
  id: string;
  name: string;
  drug_type: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'other';
  unit?: string;
}

export const CLINICAL_MEDICINES: ClinicalMedicine[] = [
  { id: 'med-1', name: 'Paracetamol 650mg (Dolo 650)', drug_type: 'tablet' },
  { id: 'med-2', name: 'Amoxicillin + Clavulanate 625mg (Augmentin)', drug_type: 'tablet' },
  { id: 'med-3', name: 'Pantoprazole 40mg (Pan 40)', drug_type: 'tablet' },
  { id: 'med-4', name: 'Cetirizine 10mg (Cetzine)', drug_type: 'tablet' },
  { id: 'med-5', name: 'Azithromycin 500mg (Azee 500)', drug_type: 'tablet' },
  { id: 'med-6', name: 'Metformin 500mg (Glycomet 500)', drug_type: 'tablet' },
  { id: 'med-7', name: 'Telmisartan 40mg (Telma 40)', drug_type: 'tablet' },
  { id: 'med-8', name: 'Amlodipine 5mg (Amlong 5)', drug_type: 'tablet' },
  { id: 'med-9', name: 'Omeprazole 20mg (Omez 20)', drug_type: 'capsule' },
  { id: 'med-10', name: 'Ibuprofen 400mg (Brufen)', drug_type: 'tablet' },
  { id: 'med-11', name: 'Cough Syrup (Ascoril-D 100ml)', drug_type: 'syrup' },
  { id: 'med-12', name: 'Antacid Gel Syrup (Gelusil 200ml)', drug_type: 'syrup' },
  { id: 'med-13', name: 'Ceftriaxone 1g IV/IM (Monocef 1g)', drug_type: 'injection', unit: 'vial' },
  { id: 'med-14', name: 'Ondansetron 4mg (Emeset)', drug_type: 'injection', unit: 'ampoule' },
  { id: 'med-15', name: 'Diclofenac 75mg (Voveran)', drug_type: 'injection', unit: 'ampoule' },
  { id: 'med-16', name: 'Multivitamin + Zinc (Becadexamin)', drug_type: 'capsule' },
  { id: 'med-17', name: 'Ciprofloxacin 500mg (Ciplox 500)', drug_type: 'tablet' },
  { id: 'med-18', name: 'Montelukast + Levocetirizine (Montair-LC)', drug_type: 'tablet' },
  { id: 'med-19', name: 'B-Complex with B12 Syrup (Becosules 100ml)', drug_type: 'syrup' },
  { id: 'med-20', name: 'ORS Electrolyte Sachet', drug_type: 'other', unit: 'sachet' },
  { id: 'med-21', name: 'Atorvastatin 10mg (Atorva 10)', drug_type: 'tablet' },
  { id: 'med-22', name: 'Rabeprazole + Domperidone (Razo-D)', drug_type: 'capsule' },
  { id: 'med-23', name: 'Domperidone 10mg (Domstal)', drug_type: 'tablet' },
  { id: 'med-24', name: 'Tramadol 50mg (Tramazac)', drug_type: 'injection', unit: 'ampoule' },
  { id: 'med-25', name: 'Salbutamol Inhaler (Asthalin 100mcg)', drug_type: 'other', unit: 'inhaler' },
];
