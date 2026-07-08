using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsTaskAssignment
{
    public Guid WmstaskAssignId { get; set; }

    public Guid WmstaskAssignTaskId { get; set; }

    public Guid? WmstaskAssignAssignedUserId { get; set; }

    public Guid? WmstaskAssignAssignedRoleId { get; set; }

    public Guid? WmstaskAssignAssignedEquipmentId { get; set; }

    public DateTime WmstaskAssignAssignedAt { get; set; }

    public DateTime? WmstaskAssignAcceptedAt { get; set; }

    public DateTime? WmstaskAssignReleasedAt { get; set; }

    public bool WmstaskAssignIsCurrent { get; set; }

    public virtual WmsEquipment? WmstaskAssignAssignedEquipment { get; set; }

    public virtual CmpUser? WmstaskAssignAssignedUser { get; set; }

    public virtual WmsTask WmstaskAssignTask { get; set; } = null!;
}
