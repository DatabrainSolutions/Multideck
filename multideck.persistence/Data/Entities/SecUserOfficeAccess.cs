using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecUserOfficeAccess
{
    public Guid SecuserOfficeId { get; set; }

    public Guid SecuserOfficeUserId { get; set; }

    public Guid SecuserOfficeOrgOfficeId { get; set; }

    public string SecuserOfficeStatusCode { get; set; } = null!;

    public bool SecuserOfficeIsDefault { get; set; }

    public bool SecuserOfficeCanView { get; set; }

    public bool SecuserOfficeCanCreateJobs { get; set; }

    public bool SecuserOfficeCanApprove { get; set; }

    public DateTime SecuserOfficeEffectiveFrom { get; set; }

    public DateTime? SecuserOfficeEffectiveTo { get; set; }

    public DateTime SecuserOfficeCreatedAt { get; set; }

    public Guid? SecuserOfficeCreatedBy { get; set; }

    public virtual CmpUser? SecuserOfficeCreatedByNavigation { get; set; }

    public virtual CmpOffice SecuserOfficeOrgOffice { get; set; } = null!;

    public virtual SysSecgrantStatus SecuserOfficeStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser SecuserOfficeUser { get; set; } = null!;
}
