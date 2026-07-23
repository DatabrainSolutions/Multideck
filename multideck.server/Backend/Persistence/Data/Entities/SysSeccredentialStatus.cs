using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSeccredentialStatus
{
    public string SeccredStatusCode { get; set; } = null!;

    public string SeccredStatusName { get; set; } = null!;

    public string? SeccredStatusDescription { get; set; }

    public bool SeccredStatusIsUsable { get; set; }

    public bool SeccredStatusIsActive { get; set; }

    public int SeccredStatusSortOrder { get; set; }

    public virtual ICollection<SecCredentialReference> SecCredentialReferences { get; set; } = new List<SecCredentialReference>();
}
