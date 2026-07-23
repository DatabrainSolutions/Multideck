using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCdsdeclarationCategory
{
    public string CdscatCode { get; set; } = null!;

    public string CdscatName { get; set; } = null!;

    public string? CdscatDirection { get; set; }

    public string? CdscatDescription { get; set; }

    public int CdscatSortOrder { get; set; }

    public bool CdscatIsActive { get; set; }

    public DateTime CdscatCreatedAt { get; set; }

    public virtual ICollection<CdsDeclaration> CdsDeclarations { get; set; } = new List<CdsDeclaration>();

    public virtual SysCustomsDeclarationDirection? CdscatDirectionNavigation { get; set; }
}
