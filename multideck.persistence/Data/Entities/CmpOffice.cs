using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpOffice
{
    public Guid OfficeId { get; set; }

    public string OfficeName { get; set; } = null!;

    public string? OfficeAddress { get; set; }

    public Guid CompanyId { get; set; }

    public virtual CmpCompany Company { get; set; } = null!;

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
