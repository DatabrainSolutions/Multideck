using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSeccredentialType
{
    public string SeccredTypeCode { get; set; } = null!;

    public string SeccredTypeName { get; set; } = null!;

    public string? SeccredTypeDescription { get; set; }

    public bool SeccredTypeIsActive { get; set; }

    public int SeccredTypeSortOrder { get; set; }

    public virtual ICollection<SecCredentialReference> SecCredentialReferences { get; set; } = new List<SecCredentialReference>();
}
