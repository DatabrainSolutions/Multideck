using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentLineJobLink
{
    public Guid FindocLineJobId { get; set; }

    public Guid FindocLineJobDocumentId { get; set; }

    public Guid FindocLineJobDocumentLineId { get; set; }

    public Guid? FindocLineJobJobId { get; set; }

    public Guid? FindocLineJobChargeInId { get; set; }

    public Guid? FindocLineJobChargeOutId { get; set; }

    public string FindocLineJobLinkTypeCode { get; set; } = null!;

    public decimal FindocLineJobNetAmount { get; set; }

    public decimal FindocLineJobLocalNetAmount { get; set; }

    public decimal FindocLineJobPercentOfLine { get; set; }

    public DateTime FindocLineJobCreatedAt { get; set; }

    public virtual JobCostingChargesIn? FindocLineJobChargeIn { get; set; }

    public virtual JobCostingChargesOut? FindocLineJobChargeOut { get; set; }

    public virtual FinDocument FindocLineJobDocument { get; set; } = null!;

    public virtual FinDocumentLine FindocLineJobDocumentLine { get; set; } = null!;

    public virtual JobHeader? FindocLineJobJob { get; set; }
}
