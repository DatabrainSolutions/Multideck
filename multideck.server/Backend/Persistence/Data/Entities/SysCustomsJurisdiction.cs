using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsJurisdiction
{
    public string CjurCode { get; set; } = null!;

    public string CjurName { get; set; } = null!;

    public string? CjurCountryCodeSnapshot { get; set; }

    public string? CjurDescription { get; set; }

    public int CjurSortOrder { get; set; }

    public bool CjurIsActive { get; set; }

    public DateTime CjurCreatedAt { get; set; }

    public virtual ICollection<CustomsDataElement> CustomsDataElements { get; set; } = new List<CustomsDataElement>();

    public virtual ICollection<CustomsDeclaration> CustomsDeclarations { get; set; } = new List<CustomsDeclaration>();

    public virtual ICollection<IcusApiConnection> IcusApiConnections { get; set; } = new List<IcusApiConnection>();

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();

    public virtual ICollection<MdxSharedCustom> MdxSharedCustoms { get; set; } = new List<MdxSharedCustom>();

    public virtual ICollection<SysCustomsDeclarationKind> SysCustomsDeclarationKinds { get; set; } = new List<SysCustomsDeclarationKind>();
}
