using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpUser
{
    public Guid UserId { get; set; }

    public Guid? AuthUserId { get; set; }

    public Guid? CompanyId { get; set; }

    public string? UserFirstname { get; set; }

    public string? UserLastname { get; set; }

    public string UserEmail { get; set; } = null!;

    public virtual CmpCompany? Company { get; set; }

    public virtual ICollection<CmpGroup> Groups { get; set; } = new List<CmpGroup>();

    public virtual ICollection<CmpOffice> Offices { get; set; } = new List<CmpOffice>();

    public virtual ICollection<SysUserRole> SysUserRoles { get; set; } = new List<SysUserRole>();
}
