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
  specifications: Record<string, string | number | boolean>;
  basePrice: number;
  baseCurrency: "SAR";
}

export interface SeedVariant {
  productKey: string;
  variantLabel: string;
  attributes: Record<string, string | number | boolean>;
  priceOverride?: number;
}

export interface SeedOffer {
  contentEn: string;
  contentAr: string;
  durationDays: number;
}

export const seedCompany: SeedCompany = {
  name: "YAS Packaging Co",
  ownerPhone: "967700000000",
  seedKey: "sample-catalog-v1",
  timezone: "Asia/Aden",
  config: {
    botEnabled: true,
    defaultLanguage: "ar",
    welcomesEnabled: true,
    catalogMode: "bilingual",
    sarToYerRate: 425,
  },
};

export const seedCategories: SeedCategory[] = [
  {
    key: "containers",
    nameEn: "Containers",
    nameAr: "حاويات",
    descriptionEn: "Food-safe takeaway containers for hot and cold meals.",
    descriptionAr: "حاويات آمنة للطعام لطلبات السفري والوجبات الساخنة والباردة.",
  },
  {
    key: "cups",
    nameEn: "Cups",
    nameAr: "أكواب",
    descriptionEn: "Hot and cold drink cups for cafes, juice bars, and events.",
    descriptionAr: "أكواب للمشروبات الساخنة والباردة للمقاهي والعصائر والفعاليات.",
  },
  {
    key: "plates",
    nameEn: "Plates",
    nameAr: "صحون",
    descriptionEn: "Disposable serving plates in plastic and eco-friendly materials.",
    descriptionAr: "صحون تقديم للاستعمال مرة واحدة بمواد بلاستيكية وصديقة للبيئة.",
  },
  {
    key: "bags",
    nameEn: "Bags",
    nameAr: "أكياس",
    descriptionEn: "Retail, bakery, and heavy-duty carry bags.",
    descriptionAr: "أكياس تسوق ومخابز وحمل ثقيل.",
  },
  {
    key: "cutlery",
    nameEn: "Cutlery",
    nameAr: "أدوات مائدة",
    descriptionEn: "Disposable forks, spoons, knives, and wrapped sets.",
    descriptionAr: "شوك وملاعق وسكاكين وأطقم مغلفة للاستعمال مرة واحدة.",
  },
];

export const seedProducts: SeedProduct[] = [
  {
    key: "meal-container-750",
    categoryKey: "containers",
    nameEn: "Rectangular Meal Container 750ml",
    nameAr: "علبة وجبات مستطيلة 750 مل",
    descriptionEn: "Microwave-safe rectangular container for rice meals and mixed dishes.",
    descriptionAr: "علبة مستطيلة آمنة للمايكرويف لوجبات الأرز والأطباق المتنوعة.",
    specifications: { capacityMl: 750, material: "PP", lidIncluded: true },
    basePrice: 0.72,
    baseCurrency: "SAR",
  },
  {
    key: "burger-box",
    categoryKey: "containers",
    nameEn: "Hinged Burger Box",
    nameAr: "علبة برجر بغطاء متصل",
    descriptionEn: "Rigid burger box that keeps sandwiches secure during delivery.",
    descriptionAr: "علبة برجر متينة تحافظ على الساندويتش أثناء التوصيل.",
    specifications: { material: "Foam", vented: true, color: "White" },
    basePrice: 0.41,
    baseCurrency: "SAR",
  },
  {
    key: "soup-container",
    categoryKey: "containers",
    nameEn: "Round Soup Container",
    nameAr: "علبة شوربة دائرية",
    descriptionEn: "Leak-resistant soup bowl with tight lid for hot liquids.",
    descriptionAr: "علبة شوربة مقاومة للتسرب مع غطاء محكم للسوائل الساخنة.",
    specifications: { material: "PP", lidIncluded: true, useCase: "Soup" },
    basePrice: 0.38,
    baseCurrency: "SAR",
  },
  {
    key: "foil-tray",
    categoryKey: "containers",
    nameEn: "Aluminum Foil Tray",
    nameAr: "صينية ألمنيوم فويل",
    descriptionEn: "Oven-ready foil tray for grilled meals and catering portions.",
    descriptionAr: "صينية فويل جاهزة للفرن للوجبات المشوية وحصص التموين.",
    specifications: { material: "Aluminum", ovenSafe: true, gauge: "Heavy" },
    basePrice: 0.95,
    baseCurrency: "SAR",
  },
  {
    key: "double-wall-cup",
    categoryKey: "cups",
    nameEn: "Double Wall Paper Cup",
    nameAr: "كوب ورقي مزدوج الجدار",
    descriptionEn: "Insulated paper cup for coffee, tea, and hot chocolate.",
    descriptionAr: "كوب ورقي عازل للقهوة والشاي والشوكولاتة الساخنة.",
    specifications: { material: "Paper", insulated: true, drinkType: "Hot" },
    basePrice: 0.29,
    baseCurrency: "SAR",
  },
  {
    key: "pet-cold-cup",
    categoryKey: "cups",
    nameEn: "Clear PET Cold Cup",
    nameAr: "كوب بارد شفاف PET",
    descriptionEn: "Crystal-clear cold cup for juices, iced coffee, and smoothies.",
    descriptionAr: "كوب بارد شفاف للعصائر والقهوة المثلجة والسموثي.",
    specifications: { material: "PET", drinkType: "Cold", clarity: "High" },
    basePrice: 0.24,
    baseCurrency: "SAR",
  },
  {
    key: "ripple-cup",
    categoryKey: "cups",
    nameEn: "Ripple Coffee Cup",
    nameAr: "كوب قهوة مموج",
    descriptionEn: "Triple-ripple coffee cup with heat grip and premium finish.",
    descriptionAr: "كوب قهوة مموج بثلاث طبقات مع عزل وملمس فاخر.",
    specifications: { material: "Paper", wallStyle: "Ripple", drinkType: "Hot" },
    basePrice: 0.33,
    baseCurrency: "SAR",
  },
  {
    key: "plastic-plate",
    categoryKey: "plates",
    nameEn: "Premium Plastic Plate",
    nameAr: "صحن بلاستيك فاخر",
    descriptionEn: "Strong serving plate for parties, buffets, and catering.",
    descriptionAr: "صحن تقديم قوي للحفلات والبوفيهات وخدمات التموين.",
    specifications: { material: "PS", reusableLook: true, color: "White" },
    basePrice: 0.19,
    baseCurrency: "SAR",
  },
  {
    key: "bagasse-plate",
    categoryKey: "plates",
    nameEn: "Bagasse Round Plate",
    nameAr: "صحن دائري من الباجاس",
    descriptionEn: "Eco-friendly plate made from sugarcane fiber.",
    descriptionAr: "صحن صديق للبيئة مصنوع من ألياف قصب السكر.",
    specifications: { material: "Bagasse", compostable: true, color: "Natural" },
    basePrice: 0.27,
    baseCurrency: "SAR",
  },
  {
    key: "compartment-plate",
    categoryKey: "plates",
    nameEn: "3-Section Compartment Plate",
    nameAr: "صحن ثلاثي الأقسام",
    descriptionEn: "Compartment plate that separates rice, salad, and main dishes.",
    descriptionAr: "صحن بأقسام منفصلة يفصل الأرز والسلطة والطبق الرئيسي.",
    specifications: { sections: 3, material: "Bagasse", compostable: true },
    basePrice: 0.36,
    baseCurrency: "SAR",
  },
  {
    key: "tshirt-bag",
    categoryKey: "bags",
    nameEn: "Heavy Duty T-Shirt Bag",
    nameAr: "كيس تي شيرت ثقيل",
    descriptionEn: "Retail carry bag with strong handles for grocery and takeaway use.",
    descriptionAr: "كيس تسوق بمقابض قوية للبقالة وطلبات السفري.",
    specifications: { material: "HDPE", printed: false, handleType: "T-Shirt" },
    basePrice: 0.12,
    baseCurrency: "SAR",
  },
  {
    key: "bakery-bag",
    categoryKey: "bags",
    nameEn: "Printed Bakery Bag",
    nameAr: "كيس مخبوزات مطبوع",
    descriptionEn: "Grease-resistant bakery bag for pastries, croissants, and buns.",
    descriptionAr: "كيس مخبوزات مقاوم للدهون للمعجنات والكرواسون والخبز.",
    specifications: { material: "Paper", greaseResistant: true, printed: true },
    basePrice: 0.09,
    baseCurrency: "SAR",
  },
  {
    key: "zip-bag",
    categoryKey: "bags",
    nameEn: "Resealable Zip Bag",
    nameAr: "كيس بسحاب قابل للإغلاق",
    descriptionEn: "Transparent zip bag for spices, snacks, and accessories.",
    descriptionAr: "كيس شفاف بسحاب للتوابل والوجبات الخفيفة والإكسسوارات.",
    specifications: { material: "LDPE", resealable: true, clarity: "High" },
    basePrice: 0.15,
    baseCurrency: "SAR",
  },
  {
    key: "plastic-fork",
    categoryKey: "cutlery",
    nameEn: "Heavy Weight Plastic Fork",
    nameAr: "شوكة بلاستيك ثقيلة",
    descriptionEn: "Durable fork for takeaway meals and catering service.",
    descriptionAr: "شوكة متينة لوجبات السفري وخدمات التموين.",
    specifications: { material: "PS", weightClass: "Heavy", wrapped: false },
    basePrice: 0.07,
    baseCurrency: "SAR",
  },
  {
    key: "plastic-spoon",
    categoryKey: "cutlery",
    nameEn: "Heavy Weight Plastic Spoon",
    nameAr: "ملعقة بلاستيك ثقيلة",
    descriptionEn: "Strong spoon suitable for desserts, rice dishes, and soups.",
    descriptionAr: "ملعقة قوية مناسبة للحلويات وأطباق الأرز والشوربة.",
    specifications: { material: "PS", weightClass: "Heavy", wrapped: false },
    basePrice: 0.07,
    baseCurrency: "SAR",
  },
  {
    key: "cutlery-set",
    categoryKey: "cutlery",
    nameEn: "Wrapped Cutlery Set",
    nameAr: "طقم أدوات مائدة مغلف",
    descriptionEn: "Wrapped set with fork, knife, spoon, and tissue for delivery orders.",
    descriptionAr: "طقم مغلف يحتوي على شوكة وسكين وملعقة ومنديل لطلبات التوصيل.",
    specifications: { includesTissue: true, wrapped: true, setPieces: 4 },
    basePrice: 0.28,
    baseCurrency: "SAR",
  },
];

export const seedVariants: SeedVariant[] = [
  { productKey: "meal-container-750", variantLabel: "500ml Black Base", attributes: { capacityMl: 500, color: "Black" }, priceOverride: 0.58 },
  { productKey: "meal-container-750", variantLabel: "750ml Black Base", attributes: { capacityMl: 750, color: "Black" }, priceOverride: 0.72 },
  { productKey: "meal-container-750", variantLabel: "1000ml Black Base", attributes: { capacityMl: 1000, color: "Black" }, priceOverride: 0.84 },
  { productKey: "burger-box", variantLabel: "Small White", attributes: { size: "Small", color: "White" }, priceOverride: 0.34 },
  { productKey: "burger-box", variantLabel: "Medium White", attributes: { size: "Medium", color: "White" }, priceOverride: 0.41 },
  { productKey: "burger-box", variantLabel: "Large White", attributes: { size: "Large", color: "White" }, priceOverride: 0.49 },
  { productKey: "soup-container", variantLabel: "16oz", attributes: { sizeOz: 16, lidIncluded: true }, priceOverride: 0.38 },
  { productKey: "soup-container", variantLabel: "26oz", attributes: { sizeOz: 26, lidIncluded: true }, priceOverride: 0.49 },
  { productKey: "soup-container", variantLabel: "32oz", attributes: { sizeOz: 32, lidIncluded: true }, priceOverride: 0.57 },
  { productKey: "foil-tray", variantLabel: "650ml", attributes: { capacityMl: 650, lidIncluded: false }, priceOverride: 0.95 },
  { productKey: "foil-tray", variantLabel: "850ml", attributes: { capacityMl: 850, lidIncluded: false }, priceOverride: 1.08 },
  { productKey: "foil-tray", variantLabel: "1100ml", attributes: { capacityMl: 1100, lidIncluded: false }, priceOverride: 1.22 },
  { productKey: "double-wall-cup", variantLabel: "4oz", attributes: { sizeOz: 4, sleevesPerCarton: 20 }, priceOverride: 0.22 },
  { productKey: "double-wall-cup", variantLabel: "8oz", attributes: { sizeOz: 8, sleevesPerCarton: 20 }, priceOverride: 0.29 },
  { productKey: "double-wall-cup", variantLabel: "12oz", attributes: { sizeOz: 12, sleevesPerCarton: 20 }, priceOverride: 0.36 },
  { productKey: "pet-cold-cup", variantLabel: "12oz", attributes: { sizeOz: 12, lidFits: "Flat/Dome" }, priceOverride: 0.24 },
  { productKey: "pet-cold-cup", variantLabel: "16oz", attributes: { sizeOz: 16, lidFits: "Flat/Dome" }, priceOverride: 0.29 },
  { productKey: "pet-cold-cup", variantLabel: "20oz", attributes: { sizeOz: 20, lidFits: "Flat/Dome" }, priceOverride: 0.34 },
  { productKey: "ripple-cup", variantLabel: "8oz", attributes: { sizeOz: 8, color: "Kraft" }, priceOverride: 0.33 },
  { productKey: "ripple-cup", variantLabel: "12oz", attributes: { sizeOz: 12, color: "Kraft" }, priceOverride: 0.39 },
  { productKey: "ripple-cup", variantLabel: "16oz", attributes: { sizeOz: 16, color: "Kraft" }, priceOverride: 0.45 },
  { productKey: "plastic-plate", variantLabel: "7 inch", attributes: { diameterInch: 7, color: "White" }, priceOverride: 0.16 },
  { productKey: "plastic-plate", variantLabel: "9 inch", attributes: { diameterInch: 9, color: "White" }, priceOverride: 0.19 },
  { productKey: "plastic-plate", variantLabel: "10 inch", attributes: { diameterInch: 10, color: "White" }, priceOverride: 0.23 },
  { productKey: "bagasse-plate", variantLabel: "8 inch", attributes: { diameterInch: 8, compostable: true }, priceOverride: 0.24 },
  { productKey: "bagasse-plate", variantLabel: "10 inch", attributes: { diameterInch: 10, compostable: true }, priceOverride: 0.27 },
  { productKey: "compartment-plate", variantLabel: "9 inch", attributes: { diameterInch: 9, sections: 3 }, priceOverride: 0.36 },
  { productKey: "compartment-plate", variantLabel: "10 inch", attributes: { diameterInch: 10, sections: 3 }, priceOverride: 0.42 },
  { productKey: "tshirt-bag", variantLabel: "Small", attributes: { size: "Small", thicknessMicron: 22 }, priceOverride: 0.09 },
  { productKey: "tshirt-bag", variantLabel: "Medium", attributes: { size: "Medium", thicknessMicron: 28 }, priceOverride: 0.12 },
  { productKey: "tshirt-bag", variantLabel: "Large", attributes: { size: "Large", thicknessMicron: 35 }, priceOverride: 0.16 },
  { productKey: "bakery-bag", variantLabel: "Small", attributes: { size: "Small", printed: true }, priceOverride: 0.09 },
  { productKey: "bakery-bag", variantLabel: "Large", attributes: { size: "Large", printed: true }, priceOverride: 0.13 },
  { productKey: "zip-bag", variantLabel: "12x18 cm", attributes: { widthCm: 12, heightCm: 18 }, priceOverride: 0.11 },
  { productKey: "zip-bag", variantLabel: "18x25 cm", attributes: { widthCm: 18, heightCm: 25 }, priceOverride: 0.15 },
  { productKey: "zip-bag", variantLabel: "25x35 cm", attributes: { widthCm: 25, heightCm: 35 }, priceOverride: 0.2 },
  { productKey: "plastic-fork", variantLabel: "Black", attributes: { color: "Black", wrapped: false }, priceOverride: 0.07 },
  { productKey: "plastic-fork", variantLabel: "Clear", attributes: { color: "Clear", wrapped: false }, priceOverride: 0.07 },
  { productKey: "plastic-spoon", variantLabel: "Black", attributes: { color: "Black", wrapped: false }, priceOverride: 0.07 },
  { productKey: "plastic-spoon", variantLabel: "Clear", attributes: { color: "Clear", wrapped: false }, priceOverride: 0.07 },
  { productKey: "cutlery-set", variantLabel: "Standard Set", attributes: { knifeIncluded: true, napkinPly: 1 }, priceOverride: 0.28 },
  { productKey: "cutlery-set", variantLabel: "Premium Set", attributes: { knifeIncluded: true, napkinPly: 2 }, priceOverride: 0.34 },
];

export const seedOffers: SeedOffer[] = [
  {
    contentEn: "20% off all meal containers this week for restaurant accounts.",
    contentAr: "خصم 20% على جميع علب الوجبات هذا الأسبوع لحسابات المطاعم.",
    durationDays: 7,
  },
  {
    contentEn: "Buy 2 cartons of paper cups and get 1 sleeve of lids free.",
    contentAr: "اشترِ كرتونين من الأكواب الورقية واحصل على سليف أغطية مجاناً.",
    durationDays: 14,
  },
];

export const seedCurrencyRate = {
  fromCurrency: "SAR",
  toCurrency: "YER",
  rate: 425,
} as const;
