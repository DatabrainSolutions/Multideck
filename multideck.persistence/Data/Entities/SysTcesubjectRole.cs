using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcesubjectRole
{
    public string TcesubjectRoleCode { get; set; } = null!;

    public string TcesubjectRoleName { get; set; } = null!;

    public string? TcesubjectRoleDescription { get; set; }

    public bool TcesubjectRoleIsActive { get; set; }

    public int TcesubjectRoleSortOrder { get; set; }

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();
}
