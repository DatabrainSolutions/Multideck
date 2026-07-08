using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbondedMovementType
{
    public string WmsbondedMovementTypeCode { get; set; } = null!;

    public string WmsbondedMovementTypeName { get; set; } = null!;

    public string? WmsbondedMovementTypeDescription { get; set; }

    public bool WmsbondedMovementTypeIsRemoval { get; set; }

    public bool WmsbondedMovementTypeIsActive { get; set; }

    public int WmsbondedMovementTypeSortOrder { get; set; }

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();
}
