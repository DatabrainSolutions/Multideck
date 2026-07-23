using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedTemporaryRemoval
{
    public Guid WmsbondTempRemovalId { get; set; }

    public Guid? WmsbondTempRemovalRemovalId { get; set; }

    public Guid? WmsbondTempRemovalEntryId { get; set; }

    public string? WmsbondTempRemovalAuthorityPermissionReference { get; set; }

    public string WmsbondTempRemovalReason { get; set; } = null!;

    public DateTime? WmsbondTempRemovalRemovedAt { get; set; }

    public DateTime? WmsbondTempRemovalDueBackAt { get; set; }

    public DateTime? WmsbondTempRemovalReturnedAt { get; set; }

    public string WmsbondTempRemovalStatusCode { get; set; } = null!;

    public Guid? WmsbondTempRemovalEscortedByUserId { get; set; }

    public string? WmsbondTempRemovalNotes { get; set; }

    public virtual WmsBondedEntry? WmsbondTempRemovalEntry { get; set; }

    public virtual CmpUser? WmsbondTempRemovalEscortedByUser { get; set; }

    public virtual WmsBondedRemoval? WmsbondTempRemovalRemoval { get; set; }
}
