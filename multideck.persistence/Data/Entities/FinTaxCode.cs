using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxCode
{
    public Guid FintaxId { get; set; }

    public string FintaxCode { get; set; } = null!;

    public string FintaxName { get; set; } = null!;

    public string? FintaxCountryCode { get; set; }

    public decimal FintaxRatePercent { get; set; }

    public string FintaxTaxTypeCode { get; set; } = null!;

    public string? FintaxProviderMappingHint { get; set; }

    public bool FintaxIsRecoverable { get; set; }

    public bool FintaxIsActive { get; set; }

    public DateOnly FintaxEffectiveFrom { get; set; }

    public DateOnly? FintaxEffectiveTo { get; set; }

    public virtual ICollection<FinChargeAccountingRule> FinChargeAccountingRules { get; set; } = new List<FinChargeAccountingRule>();

    public virtual ICollection<FinDocumentLine> FinDocumentLines { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinDocumentTaxis> FinDocumentTaxes { get; set; } = new List<FinDocumentTaxis>();
}
