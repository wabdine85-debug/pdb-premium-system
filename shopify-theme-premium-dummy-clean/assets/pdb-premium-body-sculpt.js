(function () {
  'use strict';
  var variants = {
    '59265461846280': { option: 'ems', duration: 30 },
    '59265461879048': { option: 'ems_lymph', duration: 60 }
  };
  window.PDBBodySculpt = {
    getSelection: function (client) {
      var items = client && client.apntlyBookingModalData && client.apntlyBookingModalData.cartItems;
      if (!Array.isArray(items) || items.length !== 1) return null;
      var slot = items[0] && items[0].timeSlot;
      var variant = slot && slot.serviceVariant;
      var expected = variant && variants[String(variant.variantId)];
      if (!expected || Number(variant.durationInMin) !== expected.duration) return null;
      return {
        body_sculpt_option: expected.option,
        body_sculpt_variant_id: String(variant.variantId),
        body_sculpt_duration_minutes: expected.duration
      };
    }
  };
}());
