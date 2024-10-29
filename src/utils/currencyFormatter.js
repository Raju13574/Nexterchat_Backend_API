const formatCurrency = {
  // Convert paisa to rupees with formatting
  formatFromPaisa: (amountInPaisa) => {
    const amountInRupees = amountInPaisa / 100;
    return {
      amountInPaisa,
      amountInRupees,
      formatted: `₹${amountInRupees.toFixed(2)}`,
      formattedWithCommas: `₹${amountInRupees.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    };
  },

  // Convert rupees to paisa for storage
  convertToPaisa: (amountInRupees) => {
    return Math.round(amountInRupees * 100);
  }
};

module.exports = formatCurrency;
