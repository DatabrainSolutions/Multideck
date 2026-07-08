using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAccountAssignment
{
    public Guid CrmaccountAssignId { get; set; }

    public Guid CrmaccountAssignAccountId { get; set; }

    public Guid CrmaccountAssignUserId { get; set; }

    public string CrmaccountAssignRole { get; set; } = null!;

    public bool CrmaccountAssignIsPrimary { get; set; }

    public DateOnly CrmaccountAssignStartDate { get; set; }

    public DateOnly? CrmaccountAssignEndDate { get; set; }

    public DateTime CrmaccountAssignCreatedAt { get; set; }

    public Guid? CrmaccountAssignCreatedBy { get; set; }

    public virtual CrmAccountProfile CrmaccountAssignAccount { get; set; } = null!;

    public virtual CmpUser? CrmaccountAssignCreatedByNavigation { get; set; }

    public virtual CmpUser CrmaccountAssignUser { get; set; } = null!;
}
