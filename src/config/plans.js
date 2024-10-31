const plans = [
  { 
    id: 'free', 
    name: 'Free Plan', 
    creditsPerDay: 15, 
    priceInPaisa: 0,
    duration: 365, // days
    features: ['Basic compilation', 'Standard support']
  },
  { 
    id: 'monthly', 
    name: 'Monthly Plan', 
    creditsPerDay: 1500, 
    priceInPaisa: 49900, // ₹499
    duration: 30,
    features: ['Advanced compilation', 'Priority support', 'API access']
  },
  { 
    id: 'three_month', 
    name: 'Three Months Plan', 
    creditsPerDay: 2000, 
    priceInPaisa: 129900, // ₹1,299
    duration: 90,
    features: ['Advanced compilation', 'Priority support', 'API access', 'Bulk compilation']
  },
  { 
    id: 'six_month', 
    name: 'Six Months Plan', 
    creditsPerDay: 3000, 
    priceInPaisa: 199900, // ₹1,999
    duration: 180,
    features: ['Advanced compilation', 'Premium support', 'API access', 'Bulk compilation']
  },
  { 
    id: 'yearly', 
    name: 'Yearly Plan', 
    creditsPerDay: 'Unlimited', 
    priceInPaisa: 359900, // ₹3,599
    duration: 365,
    features: ['Advanced compilation', 'Premium support', 'Unlimited API access', 'Bulk compilation', 'Custom features']
  }
];

module.exports = plans; 