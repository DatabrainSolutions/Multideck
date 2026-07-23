using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsCycleCountLine
{
    public Guid WmscountLineId { get; set; }

    public Guid WmscountLineCountPlanId { get; set; }

    public Guid? WmscountLineBalanceId { get; set; }

    public Guid? WmscountLineLocationId { get; set; }

    public Guid? WmscountLineItemId { get; set; }

    public decimal WmscountLineSystemQuantity { get; set; }

    public decimal? WmscountLineCountedQuantity { get; set; }

    public decimal? WmscountLineVarianceQuantity { get; set; }

    public string WmscountLineUomcode { get; set; } = null!;

    public string WmscountLineStatusCode { get; set; } = null!;

    public DateTime? WmscountLineCountedAt { get; set; }

    public Guid? WmscountLineCountedBy { get; set; }

    public string? WmscountLineNotes { get; set; }

    public virtual WmsInventoryBalance? WmscountLineBalance { get; set; }

    public virtual WmsCycleCountPlan WmscountLineCountPlan { get; set; } = null!;

    public virtual CmpUser? WmscountLineCountedByNavigation { get; set; }

    public virtual WmsItem? WmscountLineItem { get; set; }

    public virtual WmsLocation? WmscountLineLocation { get; set; }
}
