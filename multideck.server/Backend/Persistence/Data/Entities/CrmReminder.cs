using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmReminder
{
    public Guid CrmreminderId { get; set; }

    public Guid CrmreminderUserId { get; set; }

    public Guid? CrmreminderAccountId { get; set; }

    public Guid? CrmreminderLeadId { get; set; }

    public Guid? CrmreminderOpportunityId { get; set; }

    public string CrmreminderTitle { get; set; } = null!;

    public DateTime CrmreminderDueAt { get; set; }

    public DateTime? CrmreminderCompletedAt { get; set; }

    public bool CrmreminderIsDismissed { get; set; }

    public DateTime CrmreminderCreatedAt { get; set; }

    public virtual CrmAccountProfile? CrmreminderAccount { get; set; }

    public virtual CrmLead? CrmreminderLead { get; set; }

    public virtual CrmOpportunity? CrmreminderOpportunity { get; set; }

    public virtual CmpUser CrmreminderUser { get; set; } = null!;
}
