using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadAssignment
{
    public Guid CrmleadAssignId { get; set; }

    public Guid CrmleadAssignLeadId { get; set; }

    public Guid CrmleadAssignAssignedUserId { get; set; }

    public string CrmleadAssignAssignmentRole { get; set; } = null!;

    public DateTime CrmleadAssignAssignedAt { get; set; }

    public Guid? CrmleadAssignAssignedBy { get; set; }

    public DateTime? CrmleadAssignEndedAt { get; set; }

    public bool CrmleadAssignIsActive { get; set; }

    public virtual CmpUser? CrmleadAssignAssignedByNavigation { get; set; }

    public virtual CmpUser CrmleadAssignAssignedUser { get; set; } = null!;

    public virtual CrmLead CrmleadAssignLead { get; set; } = null!;
}
