export interface SeedCompany {
  name: string;
  ownerPhone: string;
  seedKey: string;
  timezone: string;
  config: Record<string, string | number | boolean>;
}

export interface SeedCategory {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface SeedProduct {
  key: string;
  categoryKey: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  price: number;
  currency: "SAR";
}

export interface SeedVariant {
  productKey: string;
  labelEn: string;
  price?: number;
}

export interface SeedOffer {
  contentEn: string;
  contentAr: string;
  durationDays: number;
}

export const seedCompanyTemplate = {
  name: "YAS Packaging Co",
  seedKey: "sample-catalog-v1",
  timezone: "Asia/Aden",
  config: {
    botEnabled: true,
    defaultLanguage: "ar",
    welcomesEnabled: true,
    catalogMode: "bilingual",
    sarToYerRate: 425,
  },
} satisfies Omit<SeedCompany, "ownerPhone">;

export const buildSeedCompany = (ownerPhone: string): SeedCompany => ({
  ...seedCompanyTemplate,
  ownerPhone,
});

export const seedCategories: SeedCategory[] = [
  { key: "containers", nameEn: "Containers", nameAr: "حاويات", descriptionEn: "Food-safe takeaway containers for hot and cold meals.", descriptionAr: "حاويات آمنة للطعام لطلبات السفري والوجبات الساخنة والباردة." },
  { key: "cups", nameEn: "Cups", nameAr: "أكواب", descriptionEn: "Hot and cold drink cups for cafes, juice bars, and events.", descriptionAr: "أكواب للمشروبات الساخنة والباردة للمقاهي والعصائر والفعاليات." },
  { key: "plates", nameEn: "Plates", nameAr: "صحون", descriptionEn: "Disposable serving plates in plastic and eco-friendly materials.", descriptionAr: "صحون تقديم للاستعمال مرة واحدة بمواد بلاستيكية وصديقة للبيئة." },
  { key: "bags", nameEn: "Bags", nameAr: "أكياس", descriptionEn: "Retail, bakery, and heavy-duty carry bags.", descriptionAr: "أكياس تسوق ومخابز وحمل ثقيل." },
  { key: "cutlery", nameEn: "Cutlery", nameAr: "أدوات مائدة", descriptionEn: "Disposable forks, spoons, knives, and wrapped sets.", descriptionAr: "شوك وملاعق وسكاكين وأطقم مغلفة للاستعمال مرة واحدة." },
];

export const seedProducts: SeedProduct[] = [
  { key: "meal-container-750", categoryKey: "containers", nameEn: "Rectangular Meal Container 750ml", nameAr: "علبة وجبات مستطيلة 750 مل", descriptionEn: "Microwave-safe rectangular container for rice meals and mixed dishes.", descriptionAr: "علبة مستطيلة آمنة للمايكرويف لوجبات الأرز والأطباق المتنوعة.", price: 0.72, currency: "SAR" },
  { key: "burger-box", categoryKey: "containers", nameEn: "Hinged Burger Box", nameAr: "علبة برجر بغطاء متصل", descriptionEn: "Rigid burger box that keeps sandwiches secure during delivery.", descriptionAr: "علبة برجر متينة تحافظ على الساندويتش أثناء التوصيل.", price: 0.41, currency: "SAR" },
  { key: "soup-container", categoryKey: "containers", nameEn: "Round Soup Container", nameAr: "علبة شوربة دائرية", descriptionEn: "Leak-resistant soup bowl with tight lid for hot liquids.", descriptionAr: "علبة شوربة مقاومة للتسرب مع غطاء محكم للسوائل الساخنة.", price: 0.38, currency: "SAR" },
  { key: "foil-tray", categoryKey: "containers", nameEn: "Aluminum Foil Tray", nameAr: "صينية ألمنيوم فويل", descriptionEn: "Oven-ready foil tray for grilled meals and catering portions.", descriptionAr: "صينية فويل جاهزة للفرن للوجبات المشوية وحصص التموين.", price: 0.95, currency: "SAR" },
  { key: "double-wall-cup", categoryKey: "cups", nameEn: "Double Wall Paper Cup", nameAr: "كوب ورقي مزدوج الجدار", descriptionEn: "Insulated paper cup for coffee, tea, and hot chocolate.", descriptionAr: "كوب ورقي عازل للقهوة والشاي والشوكولاتة الساخنة.", price: 0.29, currency: "SAR" },
  { key: "pet-cold-cup", categoryKey: "cups", nameEn: "Clear PET Cold Cup", nameAr: "كوب بارد شفاف PET", descriptionEn: "Crystal-clear cold cup for juices, iced coffee, and smoothies.", descriptionAr: "كوب بارد شفاف للعصائر والقهوة المثلجة والسموثي.", price: 0.24, currency: "SAR" },
  { key: "ripple-cup", categoryKey: "cups", nameEn: "Ripple Coffee Cup", nameAr: "كوب قهوة مموج", descriptionEn: "Triple-ripple coffee cup with heat grip and premium finish.", descriptionAr: "كوب قهوة مموج بثلاث طبقات مع عزل وملمس فاخر.", price: 0.33, currency: "SAR" },
  { key: "plastic-plate", categoryKey: "plates", nameEn: "Premium Plastic Plate", nameAr: "صحن بلاستيك فاخر", descriptionEn: "Strong serving plate for parties, buffets, and catering.", descriptionAr: "صحن تقديم قوي للحفلات والبوفيهات وخدمات التموين.", price: 0.19, currency: "SAR" },
  { key: "bagasse-plate", categoryKey: "plates", nameEn: "Bagasse Round Plate", nameAr: "صحن دائري من الباجاس", descriptionEn: "Eco-friendly plate made from sugarcane fiber.", descriptionAr: "صحن صديق للبيئة مصنوع من ألياف قصب السكر.", price: 0.27, currency: "SAR" },
  { key: "compartment-plate", categoryKey: "plates", nameEn: "3-Section Compartment Plate", nameAr: "صحن ثلاثي الأقسام", descriptionEn: "Compartment plate that separates rice, salad, and main dishes.", descriptionAr: "صحن بأقسام منفصلة يفصل الأرز والسلطة والطبق الرئيسي.", price: 0.36, currency: "SAR" },
  { key: "tshirt-bag", categoryKey: "bags", nameEn: "Heavy Duty T-Shirt Bag", nameAr: "كيس تي شيرت ثقيل", descriptionEn: "Retail carry bag with strong handles for grocery and takeaway use.", descriptionAr: "كيس تسوق بمقابض قوية للبقالة وطلبات السفري.", price: 0.12, currency: "SAR" },
  { key: "bakery-bag", categoryKey: "bags", nameEn: "Printed Bakery Bag", nameAr: "كيس مخبوزات مطبوع", descriptionEn: "Grease-resistant bakery bag for pastries, croissants, and buns.", descriptionAr: "كيس مخبوزات مقاوم للدهون للمعجنات والكرواسون والخبز.", price: 0.09, currency: "SAR" },
  { key: "zip-bag", categoryKey: "bags", nameEn: "Resealable Zip Bag", nameAr: "كيس بسحاب قابل للإغلاق", descriptionEn: "Transparent zip bag for spices, snacks, and accessories.", descriptionAr: "كيس شفاف بسحاب للتوابل والوجبات الخفيفة والإكسسوارات.", price: 0.15, currency: "SAR" },
  { key: "plastic-fork", categoryKey: "cutlery", nameEn: "Heavy Weight Plastic Fork", nameAr: "شوكة بلاستيك ثقيلة", descriptionEn: "Durable fork for takeaway meals and catering service.", descriptionAr: "شوكة متينة لوجبات السفري وخدمات التموين.", price: 0.07, currency: "SAR" },
  { key: "plastic-spoon", categoryKey: "cutlery", nameEn: "Heavy Weight Plastic Spoon", nameAr: "ملعقة بلاستيك ثقيلة", descriptionEn: "Strong spoon suitable for desserts, rice dishes, and soups.", descriptionAr: "ملعقة قوية مناسبة للحلويات وأطباق الأرز والشوربة.", price: 0.07, currency: "SAR" },
  { key: "cutlery-set", categoryKey: "cutlery", nameEn: "Wrapped Cutlery Set", nameAr: "طقم أدوات مائدة مغلف", descriptionEn: "Wrapped set with fork, knife, spoon, and tissue for delivery orders.", descriptionAr: "طقم مغلف يحتوي على شوكة وسكين وملعقة ومنديل لطلبات التوصيل.", price: 0.28, currency: "SAR" },
];

export const seedVariants: SeedVariant[] = [
  { productKey: "meal-container-750", labelEn: "500ml Black Base", price: 0.58 },
  { productKey: "meal-container-750", labelEn: "750ml Black Base", price: 0.72 },
  { productKey: "meal-container-750", labelEn: "1000ml Black Base", price: 0.84 },
  { productKey: "burger-box", labelEn: "Small White", price: 0.34 },
  { productKey: "burger-box", labelEn: "Medium White", price: 0.41 },
  { productKey: "burger-box", labelEn: "Large White", price: 0.49 },
  { productKey: "soup-container", labelEn: "16oz", price: 0.38 },
  { productKey: "soup-container", labelEn: "26oz", price: 0.49 },
  { productKey: "soup-container", labelEn: "32oz", price: 0.57 },
  { productKey: "foil-tray", labelEn: "650ml", price: 0.95 },
  { productKey: "foil-tray", labelEn: "850ml", price: 1.08 },
  { productKey: "foil-tray", labelEn: "1100ml", price: 1.22 },
  { productKey: "double-wall-cup", labelEn: "4oz", price: 0.22 },
  { productKey: "double-wall-cup", labelEn: "8oz", price: 0.29 },
  { productKey: "double-wall-cup", labelEn: "12oz", price: 0.36 },
  { productKey: "pet-cold-cup", labelEn: "12oz", price: 0.24 },
  { productKey: "pet-cold-cup", labelEn: "16oz", price: 0.29 },
  { productKey: "pet-cold-cup", labelEn: "20oz", price: 0.34 },
  { productKey: "ripple-cup", labelEn: "8oz", price: 0.33 },
  { productKey: "ripple-cup", labelEn: "12oz", price: 0.39 },
  { productKey: "ripple-cup", labelEn: "16oz", price: 0.45 },
  { productKey: "plastic-plate", labelEn: "7 inch", price: 0.16 },
  { productKey: "plastic-plate", labelEn: "9 inch", price: 0.19 },
  { productKey: "plastic-plate", labelEn: "10 inch", price: 0.23 },
  { productKey: "bagasse-plate", labelEn: "8 inch", price: 0.24 },
  { productKey: "bagasse-plate", labelEn: "10 inch", price: 0.27 },
  { productKey: "compartment-plate", labelEn: "9 inch", price: 0.36 },
  { productKey: "compartment-plate", labelEn: "10 inch", price: 0.42 },
  { productKey: "tshirt-bag", labelEn: "Small", price: 0.09 },
  { productKey: "tshirt-bag", labelEn: "Medium", price: 0.12 },
  { productKey: "tshirt-bag", labelEn: "Large", price: 0.16 },
  { productKey: "bakery-bag", labelEn: "Small", price: 0.09 },
  { productKey: "bakery-bag", labelEn: "Large", price: 0.13 },
  { productKey: "zip-bag", labelEn: "12x18 cm", price: 0.11 },
  { productKey: "zip-bag", labelEn: "18x25 cm", price: 0.15 },
  { productKey: "zip-bag", labelEn: "25x35 cm", price: 0.2 },
  { productKey: "plastic-fork", labelEn: "Black", price: 0.07 },
  { productKey: "plastic-fork", labelEn: "Clear", price: 0.07 },
  { productKey: "plastic-spoon", labelEn: "Black", price: 0.07 },
  { productKey: "plastic-spoon", labelEn: "Clear", price: 0.07 },
  { productKey: "cutlery-set", labelEn: "Standard Set", price: 0.28 },
  { productKey: "cutlery-set", labelEn: "Premium Set", price: 0.34 },
];

export const seedOffers: SeedOffer[] = [
  { contentEn: "20% off all meal containers this week for restaurant accounts.", contentAr: "خصم 20% على جميع علب الوجبات هذا الأسبوع لحسابات المطاعم.", durationDays: 7 },
  { contentEn: "Buy 2 cartons of paper cups and get 1 sleeve of lids free.", contentAr: "اشترِ كرتونين من الأكواب الورقية واحصل على سليف أغطية مجاناً.", durationDays: 14 },
];

export const seedCurrencyRate = {
  fromCurrency: "SAR",
  toCurrency: "YER",
  rate: 425,
} as const;
