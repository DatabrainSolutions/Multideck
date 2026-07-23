using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBillingEventLine
{
    public Guid WmsbillLineId { get; set; }

    public Guid WmsbillLineBillingEventId { get; set; }

    public int WmsbillLineLineNo { get; set; }

    public string? WmsbillLineSourceTable { get; set; }

    public Guid? WmsbillLineSourceId { get; set; }

    public string WmsbillLineDescription { get; set; } = null!;

    public decimal WmsbillLineQuantity { get; set; }

    public decimal WmsbillLineUnitRate { get; set; }

    public decimal WmsbillLineNetAmount { get; set; }

    public virtual WmsBillingEvent WmsbillLineBillingEvent { get; set; } = null!;
}
