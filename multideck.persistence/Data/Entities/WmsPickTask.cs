using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsPickTask
{
    public Guid WmspickId { get; set; }

    public Guid? WmspickTaskId { get; set; }

    public Guid? WmspickWaveId { get; set; }

    public Guid WmspickOrderLineId { get; set; }

    public Guid? WmspickBalanceId { get; set; }

    public Guid? WmspickSourceLocationId { get; set; }

    public Guid? WmspickTargetLocationId { get; set; }

    public decimal WmspickQuantityToPick { get; set; }

    public decimal WmspickQuantityPicked { get; set; }

    public string WmspickUomcode { get; set; } = null!;

    public string WmspickStatusCode { get; set; } = null!;

    public DateTime? WmspickPickedAt { get; set; }

    public Guid? WmspickPickedBy { get; set; }

    public virtual WmsInventoryBalance? WmspickBalance { get; set; }

    public virtual WmsOrderLine WmspickOrderLine { get; set; } = null!;

    public virtual CmpUser? WmspickPickedByNavigation { get; set; }

    public virtual WmsLocation? WmspickSourceLocation { get; set; }

    public virtual WmsLocation? WmspickTargetLocation { get; set; }

    public virtual WmsTask? WmspickTask { get; set; }

    public virtual WmsWave? WmspickWave { get; set; }
}
