using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsDeclarationDirection
{
    public string CddCode { get; set; } = null!;

    public string CddName { get; set; } = null!;

    public string? CddDescription { get; set; }

    public int CddSortOrder { get; set; }

    public bool CddIsActive { get; set; }

    public DateTime CddCreatedAt { get; set; }

    public virtual ICollection<CdsDeclaration> CdsDeclarations { get; set; } = new List<CdsDeclaration>();

    public virtual ICollection<CustomsDeclaration> CustomsDeclarations { get; set; } = new List<CustomsDeclaration>();

    public virtual ICollection<SysCdsdeclarationCategory> SysCdsdeclarationCategories { get; set; } = new List<SysCdsdeclarationCategory>();

    public virtual ICollection<SysCustomsDeclarationKind> SysCustomsDeclarationKinds { get; set; } = new List<SysCustomsDeclarationKind>();
}
