using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsDeclarationKind
{
    public string CdkCode { get; set; } = null!;

    public string CdkName { get; set; } = null!;

    public string? CdkJurisdictionCode { get; set; }

    public string? CdkDirection { get; set; }

    public string? CdkDescription { get; set; }

    public int CdkSortOrder { get; set; }

    public bool CdkIsActive { get; set; }

    public DateTime CdkCreatedAt { get; set; }

    public virtual SysCustomsDeclarationDirection? CdkDirectionNavigation { get; set; }

    public virtual SysCustomsJurisdiction? CdkJurisdictionCodeNavigation { get; set; }

    public virtual ICollection<CdsDeclaration> CdsDeclarations { get; set; } = new List<CdsDeclaration>();

    public virtual ICollection<CustomsDeclaration> CustomsDeclarations { get; set; } = new List<CustomsDeclaration>();

    public virtual ICollection<IcusFieldMapping> IcusFieldMappings { get; set; } = new List<IcusFieldMapping>();

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();
}
