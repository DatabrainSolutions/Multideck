using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderAssetType
{
    public string DocbatCode { get; set; } = null!;

    public string DocbatName { get; set; } = null!;

    public string? DocbatDescription { get; set; }

    public int DocbatSortOrder { get; set; }

    public bool DocbatIsActive { get; set; }

    public DateTime DocbatCreatedAt { get; set; }

    public virtual ICollection<DocbAssetLibrary> DocbAssetLibraries { get; set; } = new List<DocbAssetLibrary>();
}
