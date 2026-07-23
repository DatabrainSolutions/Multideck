using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentLine
{
    public Guid FindocLineId { get; set; }

    public Guid FindocLineDocumentId { get; set; }

    public int FindocLineLineNo { get; set; }

    public string FindocLineLineTypeCode { get; set; } = null!;

    public Guid? FindocLineChargeId { get; set; }

    public string? FindocLineChargeCodeSnapshot { get; set; }

    public string FindocLineDescription { get; set; } = null!;

    public decimal FindocLineQuantity { get; set; }

    public decimal FindocLineUnitAmount { get; set; }

    public decimal FindocLineNetAmount { get; set; }

    public Guid? FindocLineTaxCodeId { get; set; }

    public string? FindocLineTaxCodeSnapshot { get; set; }

    public decimal FindocLineTaxRatePercent { get; set; }

    public decimal FindocLineTaxAmount { get; set; }

    public decimal FindocLineGrossAmount { get; set; }

    public decimal FindocLineLocalNetAmount { get; set; }

    public decimal FindocLineLocalTaxAmount { get; set; }

    public decimal FindocLineLocalGrossAmount { get; set; }

    public Guid? FindocLineNominalAccountId { get; set; }

    public Guid? FindocLineDimension1Id { get; set; }

    public Guid? FindocLineDimension2Id { get; set; }

    public Guid? FindocLineRoeapplicationId { get; set; }

    public DateTime FindocLineCreatedAt { get; set; }

    public virtual ICollection<FinCashAllocation> FinCashAllocations { get; set; } = new List<FinCashAllocation>();

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinCreditNoteLink> FinCreditNoteLinkFincreditLinkCreditDocumentLines { get; set; } = new List<FinCreditNoteLink>();

    public virtual ICollection<FinCreditNoteLink> FinCreditNoteLinkFincreditLinkOriginalDocumentLines { get; set; } = new List<FinCreditNoteLink>();

    public virtual ICollection<FinCreditNoteRequestLine> FinCreditNoteRequestLines { get; set; } = new List<FinCreditNoteRequestLine>();

    public virtual ICollection<FinDocumentLineJobLink> FinDocumentLineJobLinks { get; set; } = new List<FinDocumentLineJobLink>();

    public virtual ICollection<FinJobChargeAllocation> FinJobChargeAllocations { get; set; } = new List<FinJobChargeAllocation>();

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual ICollection<FinVarianceItem> FinVarianceItems { get; set; } = new List<FinVarianceItem>();

    public virtual RateChargeCode? FindocLineCharge { get; set; }

    public virtual FinDimensionValue? FindocLineDimension1 { get; set; }

    public virtual FinDimensionValue? FindocLineDimension2 { get; set; }

    public virtual FinDocument FindocLineDocument { get; set; } = null!;

    public virtual SysFinanceLineType FindocLineLineTypeCodeNavigation { get; set; } = null!;

    public virtual FinNominalAccount? FindocLineNominalAccount { get; set; }

    public virtual FinTaxCode? FindocLineTaxCode { get; set; }

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();
}
