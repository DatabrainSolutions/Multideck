using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedMovement
{
    public Guid WmsbondMoveId { get; set; }

    public Guid WmsbondMoveFacilityId { get; set; }

    public Guid? WmsbondMoveEntryId { get; set; }

    public Guid? WmsbondMoveEntryLineId { get; set; }

    public Guid? WmsbondMoveBalanceId { get; set; }

    public Guid? WmsbondMoveTransactionId { get; set; }

    public string WmsbondMoveMovementTypeCode { get; set; } = null!;

    public string? WmsbondMoveMovementReference { get; set; }

    public Guid? WmsbondMoveFromLocationId { get; set; }

    public Guid? WmsbondMoveToLocationId { get; set; }

    public decimal WmsbondMoveQuantity { get; set; }

    public string WmsbondMoveUomcode { get; set; } = null!;

    public DateTime WmsbondMoveMovementAt { get; set; }

    public string? WmsbondMoveCustomsNotificationReference { get; set; }

    public string? WmsbondMoveNotes { get; set; }

    public Guid? WmsbondMoveCreatedBy { get; set; }

    public virtual WmsInventoryBalance? WmsbondMoveBalance { get; set; }

    public virtual CmpUser? WmsbondMoveCreatedByNavigation { get; set; }

    public virtual WmsBondedEntry? WmsbondMoveEntry { get; set; }

    public virtual WmsBondedEntryLine? WmsbondMoveEntryLine { get; set; }

    public virtual WmsFacility WmsbondMoveFacility { get; set; } = null!;

    public virtual WmsLocation? WmsbondMoveFromLocation { get; set; }

    public virtual SysWmsbondedMovementType WmsbondMoveMovementTypeCodeNavigation { get; set; } = null!;

    public virtual WmsLocation? WmsbondMoveToLocation { get; set; }

    public virtual WmsInventoryTransaction? WmsbondMoveTransaction { get; set; }
}
