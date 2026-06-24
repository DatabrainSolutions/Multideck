using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpCompany
{
    public Guid CompanyId { get; set; }

    public string CompanyName { get; set; } = null!;

    public virtual ICollection<CmpOffice> Offices { get; set; } = new List<CmpOffice>();

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
