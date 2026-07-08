using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpCompanyModule
{
    public Guid CompanyId { get; set; }

    public string ModuleCode { get; set; } = null!;

    public bool IsEnabled { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual CmpCompany Company { get; set; } = null!;
}
